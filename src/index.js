const path = require("path");
const express = require("express");
const { runMigrations } = require("./db/database");
const subscriptionsRouter = require("./routes/subscriptions");
const { errorHandler } = require("./middleware/errorHandler");
const { apiKeyAuth } = require("./middleware/auth");
const { startScanner } = require("./services/scanner");
const { startGrpcServer } = require("./grpc/server");
const { register, metricsMiddleware } = require("./services/metrics");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(metricsMiddleware);

app.use(express.static(path.join(__dirname, "../public")));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.get("/metrics", async (_req, res) => {
	res.set("Content-Type", register.contentType);
	res.end(await register.metrics());
});

app.use("/api", (req, res, next) => {
	const isPublicTokenRoute = req.path.startsWith("/confirm/") ||
		req.path.startsWith("/unsubscribe/");
	if (isPublicTokenRoute) return next();
	return apiKeyAuth(req, res, next);
}, subscriptionsRouter);

app.use(errorHandler);

runMigrations();

const server = app.listen(PORT, () => {
	console.log(`[HTTP] Running on port ${PORT}`);
	startScanner();
	startGrpcServer();
});

module.exports = { app, server };
