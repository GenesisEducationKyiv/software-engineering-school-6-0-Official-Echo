import { Router } from "express";
import { StatusCodes } from "http-status-codes";

import { validate, validateEmail } from "../middleware/validate.js";
import {
	confirm,
	getSubscriptions,
	subscribe,
	unsubscribe,
} from "../services/subscriptionService.js";

const router = Router();

/**
 * POST /api/subscribe
 */
router.post(
	"/subscribe",
	validate(["email", "repo"]),
	validateEmail,
	async (req, res, next) => {
		try {
			const { email, repo } = req.body;
			const result = await subscribe(email, repo);
			return res.status(StatusCodes.OK).json({ message: result.message });
		} catch (err) {
			next(err);
		}
	}
);

/**
 * GET /api/confirm/:token
 */
router.get("/confirm/:token", (req, res, next) => {
	try {
		const { token } = req.params;
		const result = confirm(token);
		return res.status(StatusCodes.OK).json({ message: result.message });
	} catch (err) {
		next(err);
	}
});

/**
 * GET /api/unsubscribe/:token
 */
router.get("/unsubscribe/:token", (req, res, next) => {
	try {
		const { token } = req.params;
		const result = unsubscribe(token);
		return res.status(StatusCodes.OK).json({ message: result.message });
	} catch (err) {
		next(err);
	}
});

/**
 * GET /api/subscriptions?email=
 */
router.get("/subscriptions", (req, res, next) => {
	try {
		const { email } = req.query;
		const result = getSubscriptions(email);
		return res.status(StatusCodes.OK).json(result.subscriptions);
	} catch (err) {
		next(err);
	}
});

export default router;
