import express from "express";
import { join } from "path";

import { httpErrorHandler } from "./errors/httpHandler.js";
import { apiKeyAuth } from "./middleware/auth.js";
import { buildSubscriptionsRouter } from "./routes/subscriptions.js";
import { metricsMiddleware, register } from "./services/metrics.js";

/**
 * Builds and returns the configured Express app.
 * @param {{ subscribe: Function, confirm: Function, unsubscribe: Function, getSubscriptions: Function }} subscriptionService
 * @param {import("express").RequestHandler} httpLoggerMiddleware
 * @returns {express.Application}
 */
export function buildApp(
	subscriptionService,
	httpLoggerMiddleware = (_req, _res, next) => next()
) {
	const app = express();

	app.use(httpLoggerMiddleware);
	app.use(express.json());
	app.use(metricsMiddleware);
	app.use(express.static(join(import.meta.dirname, "../public")));

	app.get("/health", (_req, res) => res.json({ status: "ok" }));

	app.get("/metrics", async (_req, res) => {
		res.set("Content-Type", register.contentType);
		res.end(await register.metrics());
	});

	app.use(
		"/api",
		(req, _res, next) => {
			const isPublicTokenRoute =
				req.path.startsWith("/confirm/") ||
				req.path.startsWith("/unsubscribe/");
			if (isPublicTokenRoute) return next();
			return apiKeyAuth(req, _res, next);
		},
		buildSubscriptionsRouter(subscriptionService)
	);

	app.use(httpErrorHandler);

	return app;
}
