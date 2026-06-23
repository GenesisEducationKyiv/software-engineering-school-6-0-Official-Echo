import { createTransport } from "nodemailer";

import { buildApp } from "./app.js";
import { runMigrations } from "./db/database.js";
import { startGrpcServer } from "./grpc/server.js";
import { createProducer } from "./kafka/producer.js";
import * as repository from "./repositories/subscriptionRepository.js";
import { cacheGet, cacheSet } from "./services/cache.js";
import { createGithubService } from "./services/github.js";
import { createHttpLoggerMiddleware, logger } from "./services/logger.js";
import { createNotificationService } from "./services/notificationService.js";
import { createNotifier } from "./services/notifier.js";
import { createQueryService } from "./services/queryService.js";
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

	const cache = { get: cacheGet, set: cacheSet };
	const githubService = createGithubService(cache);
	const notifier = createNotifier(transport);
	const producer = createProducer();

	const subscriptionService = createSubscriptionService({
		repository,
		githubService,
		notifier,
		producer,
	});

	const notificationService = createNotificationService({ notifier });
	const queryService = createQueryService({ repository });

	const httpLoggerMiddleware = createHttpLoggerMiddleware(logger);
	const app = buildApp(subscriptionService, httpLoggerMiddleware);

	const server = app.listen(PORT, async () => {
		logger.info({ port: PORT }, "[HTTP] Running on port %d", PORT);

		notificationService
			.start()
			.catch((err) =>
				logger.error(
					{ err },
					"[NotificationService] Failed to start consumer"
				)
			);

		startGrpcServer(subscriptionService, queryService);
	});

	//Custom shutdown logic
	const shutdown = async () => {
		logger.info("[Server] Shutting down…");
		await notificationService.stop();
		await producer.disconnect();
		server.close(() => process.exit(0));
	};

	process.once("SIGTERM", shutdown);
	process.once("SIGINT", shutdown);

	return { app, server };
}
