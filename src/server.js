import { createTransport } from "nodemailer";

import { buildApp } from "./app.js";
import { runMigrations } from "./db/database.js";
import { startGrpcServer } from "./grpc/server.js";
import * as repository from "./repositories/subscriptionRepository.js";
import { cacheGet, cacheSet } from "./services/cache.js";
import { createGithubService } from "./services/github.js";
import { createHttpLoggerMiddleware, logger } from "./services/logger.js";
import {
	notificationsSentTotal,
	scannerErrorsTotal,
	scannerRunsTotal,
} from "./services/metrics.js";
import { createNotifier } from "./services/notifier.js";
import { createScanner } from "./services/scanner.js";
import { createSubscriptionService } from "./services/subscriptionService.js";

const PORT = process.env.PORT || 3000;

export async function startServer() {
	await runMigrations();

	const transport = createTransport({
		host: process.env.SMTP_HOST || "smtp.ethereal.email",
		port: parseInt(process.env.SMTP_PORT || "587"),
		secure: process.env.SMTP_SECURE === "true",
		auth: {
			user: process.env.SMTP_USER,
			pass: process.env.SMTP_PASS,
		},
		logger: true,
		debug: true,
	});

	const cache = {
		get: cacheGet,
		set: cacheSet,
	};

	const githubService = createGithubService(cache);
	const notifier = createNotifier(transport);

	const subscriptionService = createSubscriptionService({
		repository,
		githubService,
		notifier,
	});

	const scanner = createScanner({
		githubService,
		notifier,
		repository,
		metrics: { scannerRunsTotal, notificationsSentTotal, scannerErrorsTotal },
	});

	const httpLoggerMiddleware = createHttpLoggerMiddleware(logger);
	const app = buildApp(subscriptionService, httpLoggerMiddleware);

	const server = app.listen(PORT, () => {
		logger.info({ port: PORT }, "[HTTP] Running on port %d", PORT);
		scanner.start();
		startGrpcServer(subscriptionService);
	});

	return { app, server };
}
