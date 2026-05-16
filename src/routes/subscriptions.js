import { Router } from "express";
import { StatusCodes } from "http-status-codes";

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
router.post("/subscribe", async (req, res, next) => {
	try {
		const { email, repo } = req.body;
		const result = await subscribe(email, repo);
		return res.status(StatusCodes.OK).json({ message: result.message });
	} catch (err) {
		return next(err);
	}
});

/**
 * GET /api/confirm/:token
 */
router.get("/confirm/:token", async (req, res, next) => {
	try {
		const { token } = req.params;
		const result = await confirm(token);
		return res.status(StatusCodes.OK).json({ message: result.message });
	} catch (err) {
		return next(err);
	}
});

/**
 * GET /api/unsubscribe/:token
 */
router.get("/unsubscribe/:token", async (req, res, next) => {
	try {
		const { token } = req.params;
		const result = await unsubscribe(token);
		return res.status(StatusCodes.OK).json({ message: result.message });
	} catch (err) {
		return next(err);
	}
});

/**
 * GET /api/subscriptions?email=
 */
router.get("/subscriptions", async (req, res, next) => {
	try {
		const { email } = req.query;
		const result = await getSubscriptions(email);
		return res.status(StatusCodes.OK).json(result.subscriptions);
	} catch (err) {
		return next(err);
	}
});

export default router;
