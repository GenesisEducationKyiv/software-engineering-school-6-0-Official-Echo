import { join } from "path";
import express, { json } from "express";
import { runMigrations } from "./db/database.js";
import subscriptionsRouter from "./routes/subscriptions.js";
import { errorHandler } from "./middleware/errorHandler.js";
import apiKeyAuth from "./middleware/auth.js";
import { startScanner } from "./services/scanner.js";
import { startGrpcServer } from "./grpc/server.js";
import { metricsMiddleware, register } from "./services/metrics.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(json());
app.use(metricsMiddleware);

app.use(express.static(join(import.meta.dirname, "../public")));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.get("/metrics", async (_req, res) => {
	res.set("Content-Type", register.contentType);
	res.end(await register.metrics());
});

app.use(
	"/api",
	(req, res, next) => {
		const isPublicTokenRoute =
			req.path.startsWith("/confirm/") || req.path.startsWith("/unsubscribe/");
		if (isPublicTokenRoute) return next();
		return apiKeyAuth(req, res, next);
	},
	subscriptionsRouter
);

app.use(errorHandler);

runMigrations();

const server = app.listen(PORT, () => {
	console.log(`[HTTP] Running on port ${PORT}`);
	startScanner();
	startGrpcServer();
});

export { app, server };
