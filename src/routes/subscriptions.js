import { Router } from "express";
import { StatusCodes } from "http-status-codes";

/**
 * Builds the subscriptions router with an injected service.
 * @param {{ subscribe: Function,
 * confirm: Function,
 * unsubscribe: Function,
 * getSubscriptions: Function }} subscriptionService
 * @returns {Router}
 */
export function buildSubscriptionsRouter(subscriptionService) {
	const router = Router();

	/** POST /api/subscribe */
	router.post("/subscribe", async (req, res, next) => {
		try {
			const { email, repo } = req.body;
			const result = await subscriptionService.subscribe(email, repo);
			return res.status(StatusCodes.OK).json({ message: result.message });
		} catch (err) {
			return next(err);
		}
	});

	/** GET /api/confirm/:token */
	router.get("/confirm/:token", async (req, res, next) => {
		try {
			const { token } = req.params;
			const result = await subscriptionService.confirm(token);
			return res.status(StatusCodes.OK).json({ message: result.message });
		} catch (err) {
			return next(err);
		}
	});

	/** GET /api/unsubscribe/:token */
	router.get("/unsubscribe/:token", async (req, res, next) => {
		try {
			const { token } = req.params;
			const result = await subscriptionService.unsubscribe(token);
			return res.status(StatusCodes.OK).json({ message: result.message });
		} catch (err) {
			return next(err);
		}
	});

	/** GET /api/subscriptions?email= */
	router.get("/subscriptions", async (req, res, next) => {
		try {
			const { email } = req.query;
			const result = await subscriptionService.getSubscriptions(email);
			return res.status(StatusCodes.OK).json(result.subscriptions);
		} catch (err) {
			return next(err);
		}
	});

	return router;
}
