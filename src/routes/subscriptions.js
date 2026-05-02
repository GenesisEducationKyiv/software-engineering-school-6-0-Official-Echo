const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { getDb } = require("../db/database").default;
const { isValidRepoFormat, repoExists } = require("../services/github");
const { sendConfirmationEmail } = require("../services/notifier");
const { validate, validateEmail } = require("../middleware/validate");
const SQL = require("../db/queries/subscription.js");

const router = express.Router();

/**
 * POST /api/subscribe
 * Validates repo, checks existence via GitHub API,
 * creates unconfirmed subscription, sends confirmation email.
 * Returns 200 on success (per Swagger).
 */
router.post(
	"/subscribe",
	validate(["email", "repo"]),
	validateEmail,
	async (req, res, next) => {
		const { email, repo } = req.body;

		if (!isValidRepoFormat(repo)) {
			return res.status(400).json({
				error: "Invalid repo format. Use owner/repo (e.g. denoland/deno)",
			});
		}

		try {
			const exists = await repoExists(repo);
			if (!exists) {
				return res.status(404).json({
					error: `Repository "${repo}" not found on GitHub`,
				});
			}
		} catch (err) {
			if (err.status === 429) {
				return res.status(429).json({
					error: "GitHub API rate limit exceeded. Try again later.",
					retryAfter: err.retryAfter,
				});
			}
			return next(err);
		}

		const db = getDb();
		const confirmToken = uuidv4();
		const unsubscribeToken = uuidv4();

		try {
			db.prepare(SQL.INSERT_SUBSCRIPTION).run(
				email,
				repo,
				confirmToken,
				unsubscribeToken
			);
		} catch (err) {
			if (err.message.includes("UNIQUE constraint failed")) {
				return res.status(409).json({
					error: "Email already subscribed to this repository",
				});
			}
			return next(err);
		}

		try {
			await sendConfirmationEmail({ email, repo, confirmToken });
		} catch (err) {
			console.error(
				"[Subscribe] Failed to send confirmation email:",
				err.message
			);
		}

		return res.status(200).json({
			message: "Subscription created. Check your email to confirm.",
		});
	}
);

/**
 * GET /api/confirm/:token
 * Confirms a subscription via the token sent in the confirmation email.
 */
router.get("/confirm/:token", (req, res) => {
	const { token } = req.params;

	if (!token) {
		return res.status(400).json({ error: "Invalid token" });
	}

	const db = getDb();
	const sub = db.prepare(SQL.CONFIRM_SUBSCRIPTION_BY_TOKEN).get(token);

	if (!sub) {
		return res.status(404).json({ error: "Token not found" });
	}

	if (sub.confirmed) {
		return res.status(200).json({ message: "Already confirmed" });
	}

	db.prepare("UPDATE subscriptions SET confirmed = 1 WHERE confirm_token = ?").run(
		token
	);

	return res.status(200).json({ message: "Subscription confirmed successfully" });
});

/**
 * GET /api/unsubscribe/:token
 * Removes a subscription via the unsubscribe token included in every release email.
 */
router.get("/unsubscribe/:token", (req, res) => {
	const { token } = req.params;

	if (!token) {
		return res.status(400).json({ error: "Invalid token" });
	}

	const db = getDb();
	const result = db.prepare(SQL.DELETE_SUBSCRIPTION_BY_TOKEN).run(token);

	if (result.changes === 0) {
		return res.status(404).json({ error: "Token not found" });
	}

	return res.status(200).json({ message: "Unsubscribed successfully" });
});

/**
 * GET /api/subscriptions?email=...
 * Returns all subscriptions (confirmed and unconfirmed) for an email.
 */
router.get("/subscriptions", (req, res) => {
	const { email } = req.query;

	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return res.status(400).json({ error: "Invalid email" });
	}

	const db = getDb();
	const rows = db.prepare(SQL.GET_SUBSCRIPTIONS_BY_EMAIL).all(email);

	return res.status(200).json(
		rows.map((r) => ({
			email: r.email,
			repo: r.repo,
			confirmed: r.confirmed === 1,
			last_seen_tag: r.last_seen_tag,
		}))
	);
});

module.exports = router;
