import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db/database.js";
import { isValidRepoFormat, repoExists } from "../services/github.js";
import { sendConfirmationEmail } from "../services/notifier.js";
import { validate, validateEmail } from "../middleware/validate.js";
import {
	CONFIRM_SUBSCRIPTION_BY_TOKEN,
	DELETE_SUBSCRIPTION_BY_TOKEN,
	GET_SUBSCRIPTIONS_BY_EMAIL,
	INSERT_SUBSCRIPTION,
} from "../db/queries/subscription.js";

const router = Router();

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
			db.prepare(INSERT_SUBSCRIPTION).run(
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
	const sub = db.prepare(CONFIRM_SUBSCRIPTION_BY_TOKEN).get(token);

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
	const result = db.prepare(DELETE_SUBSCRIPTION_BY_TOKEN).run(token);

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
	const rows = db.prepare(GET_SUBSCRIPTIONS_BY_EMAIL).all(email);

	return res.status(200).json(
		rows.map((r) => ({
			email: r.email,
			repo: r.repo,
			confirmed: r.confirmed === 1,
			last_seen_tag: r.last_seen_tag,
		}))
	);
});

export default router;
