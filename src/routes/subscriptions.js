import { Router } from "express";

import { validate, validateEmail } from "../middleware/validate.js";
import {
	confirm,
	ConfirmError,
	getSubscriptions,
	GetSubscriptionsError,
	subscribe,
	SubscribeError,
	unsubscribe,
	UnsubscribeError,
} from "../services/subscriptionService.js";

const router = Router();

/**
 * POST /api/subscribe
 */
router.post(
	"/subscribe",
	validate(["email", "repo"]),
	validateEmail,
	async (req, res) => {
		const { email, repo } = req.body;
		const result = subscribe(email, repo);

		if (!result.ok) {
			const statusMap = {
				[SubscribeError.MISSING_FIELDS]: 400,
				[SubscribeError.INVALID_EMAIL]: 400,
				[SubscribeError.INVALID_REPO_FORMAT]: 400,
				[SubscribeError.REPO_NOT_FOUND]: 404,
				[SubscribeError.RATE_LIMITED]: 429,
				[SubscribeError.ALREADY_EXISTS]: 409,
				[SubscribeError.INTERNAL]: 500,
			};
			return res
				.status(statusMap[result.code] ?? 500)
				.json({ error: result.error });
		}

		return res.status(200).json({ message: result.message });
	}
);

/**
 * GET /api/confirm/:token
 */
router.get("/confirm/:token", (req, res) => {
	const { token } = req.params;
	const result = confirm(token);

	if (!result.ok) {
		const statusMap = {
			[ConfirmError.MISSING_TOKEN]: 400,
			[ConfirmError.NOT_FOUND]: 404,
		};
		return res
			.status(statusMap[result.code] ?? 400)
			.json({ error: result.error });
	}

	return res.status(200).json({ message: result.message });
});

/**
 * GET /api/unsubscribe/:token
 */
router.get("/unsubscribe/:token", (req, res) => {
	const { token } = req.params;
	const result = unsubscribe(token);

	if (!result.ok) {
		const statusMap = {
			[UnsubscribeError.MISSING_TOKEN]: 400,
			[UnsubscribeError.NOT_FOUND]: 404,
		};
		return res
			.status(statusMap[result.code] ?? 400)
			.json({ error: result.error });
	}

	return res.status(200).json({ message: result.message });
});

/**
 * GET /api/subscriptions?email=
 */
router.get("/subscriptions", (req, res) => {
	const { email } = req.query;
	const result = getSubscriptions(email);

	if (!result.ok) {
		const statusMap = {
			[GetSubscriptionsError.INVALID_EMAIL]: 400,
		};
		return res
			.status(statusMap[result.code] ?? 400)
			.json({ error: result.error });
	}

	return res.status(200).json(result.subscriptions);
});

export default router;
