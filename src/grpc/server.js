import { loadPackageDefinition, Server, ServerCredentials } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { catchGrpcErrors } from "../errors/grpcHandler.js";
import { logger } from "../services/logger.js";

const protoPackage = fileURLToPath(import.meta.resolve("@ghchk/proto/package.json"));
const protoRoot = dirname(protoPackage);
const PROTO_PATH = join(protoRoot, "notifier", "v1", "notifier.proto");

const GRPC_PORT = process.env.GRPC_PORT || 50051;

const packageDef = loadSync(PROTO_PATH, {
	keepCase: true,
	longs: String,
	enums: String,
	defaults: true,
	oneofs: true,
});

const proto = loadPackageDefinition(packageDef).notifier.v1;

/**
 * @param {object} subscriptionService  Public subscription operations
 * @param {object} queryService         Confirmed-repo lookups and last-seen-tag updates
 * @returns {import("@grpc/grpc-js").Server}
 */
export function startGrpcServer(subscriptionService, queryService) {
	const Subscribe = catchGrpcErrors("Subscribe", async (call, callback) => {
		const { email, repo } = call.request;
		const result = await subscriptionService.subscribe(email, repo);
		callback(null, { message: result.message });
	});

	const Confirm = catchGrpcErrors("Confirm", async (call, callback) => {
		const { token } = call.request;
		const result = await subscriptionService.confirm(token);
		callback(null, { message: result.message });
	});

	const Unsubscribe = catchGrpcErrors("Unsubscribe", async (call, callback) => {
		const { token } = call.request;
		const result = await subscriptionService.unsubscribe(token);
		callback(null, { message: result.message });
	});

	const GetSubscriptions = catchGrpcErrors(
		"GetSubscriptions",
		async (call, callback) => {
			const { email } = call.request;
			const result = await subscriptionService.getSubscriptions(email);
			callback(null, {
				subscriptions: result.subscriptions.map((s) => ({
					email: s.email,
					repo: s.repo,
					confirmed: s.confirmed,
					last_seen_tag: s.last_seen_tag || "",
				})),
			});
		}
	);

	const FindConfirmedRepos = catchGrpcErrors(
		"FindConfirmedRepos",
		async (_call, callback) => {
			const result = await queryService.findConfirmedRepos();
			callback(null, { repos: result.repos });
		}
	);

	const FindConfirmedSubscribersByRepo = catchGrpcErrors(
		"FindConfirmedSubscribersByRepo",
		async (call, callback) => {
			const { repo } = call.request;
			const result = await queryService.findConfirmedSubscribersByRepo(repo);
			callback(null, {
				subscribers: result.subscribers.map((s) => ({
					id: String(s.id),
					email: s.email,
					unsubscribe_token: s.unsubscribe_token,
					last_seen_tag: s.last_seen_tag ?? "",
				})),
			});
		}
	);

	const UpdateLastSeenTag = catchGrpcErrors(
		"UpdateLastSeenTag",
		async (call, callback) => {
			const { id, tag } = call.request;
			await queryService.updateLastSeenTag(id, tag);
			callback(null, {});
		}
	);

	const server = new Server();

	server.addService(proto.SubscriptionService.service, {
		Subscribe,
		Confirm,
		Unsubscribe,
		GetSubscriptions,
		FindConfirmedRepos,
		FindConfirmedSubscribersByRepo,
		UpdateLastSeenTag,
	});

	server.bindAsync(
		`0.0.0.0:${GRPC_PORT}`,
		ServerCredentials.createInsecure(),
		(err, port) => {
			if (err) {
				logger.error({ err }, "[gRPC] Failed to bind");
				return;
			}
			logger.info({ port }, "[gRPC] Server listening");
		}
	);

	return server;
}
