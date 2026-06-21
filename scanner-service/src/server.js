import { createSubscriptionClient } from "./grpc/subscriptionClient.js";
import { createProducer } from "./kafka/producer.js";
import { cacheGet, cacheSet } from "./services/cache.js";
import { createGithubService } from "./services/github.js";
import { logger } from "./services/logger.js";
import {
	notificationsSentTotal,
	scannerErrorsTotal,
	scannerRunsTotal,
	startMetricsServer,
} from "./services/metrics.js";
import { createScanner } from "./services/scanner.js";

async function startServer() {
	const subscriptionClient = createSubscriptionClient(
		process.env.SUBSCRIPTION_SERVICE_GRPC_ADDR
	);

	const githubService = createGithubService({ get: cacheGet, set: cacheSet });
	const producer = createProducer();
	await producer.connect();

	const scanner = createScanner({
		subscriptionClient,
		githubService,
		producer,
		metrics: { scannerRunsTotal, scannerErrorsTotal, notificationsSentTotal },
	});

	scanner.start();
	startMetricsServer();
	logger.info("[ScannerService] Started");

	const shutdown = async () => {
		logger.info("[ScannerService] Shutting down…");
		await producer.disconnect();
		subscriptionClient.close();
		process.exit(0);
	};

	process.once("SIGTERM", shutdown);
	process.once("SIGINT", shutdown);
}

startServer().catch((err) => {
	console.error("[ScannerService] Fatal startup error", err);
	process.exit(1);
});
