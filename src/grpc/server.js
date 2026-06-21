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
 * @param {object} repository           Raw DB access
 * @returns {import("@grpc/grpc-js").Server}
 */
export function startGrpcServer(subscriptionService, repository) {
	const Subscribe = catchGrpcErrors(async (call, callback) => {
		const { email, repo } = call.request;
		const result = await subscriptionService.subscribe(email, repo);
		callback(null, { message: result.message });
	});

	const Confirm = catchGrpcErrors(async (call, callback) => {
		const { token } = call.request;
		const result = await subscriptionService.confirm(token);
		callback(null, { message: result.message });
	});

	const Unsubscribe = catchGrpcErrors(async (call, callback) => {
		const { token } = call.request;
		const result = await subscriptionService.unsubscribe(token);
		callback(null, { message: result.message });
	});

	const GetSubscriptions = catchGrpcErrors(async (call, callback) => {
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
	});

	// TODO Create a query service instead of simply using the repository
	const FindConfirmedRepos = catchGrpcErrors(async (_call, callback) => {
		const rows = await repository.findConfirmedRepos();
		callback(null, { repos: rows.map((r) => r.repo) });
	});

	const FindConfirmedSubscribersByRepo = catchGrpcErrors(
		async (call, callback) => {
			const { repo } = call.request;
			const rows = await repository.findConfirmedSubscribersByRepo(repo);
			callback(null, {
				subscribers: rows.map((r) => ({
					id: String(r.id),
					email: r.email,
					unsubscribe_token: r.unsubscribe_token,
					last_seen_tag: r.last_seen_tag ?? "",
				})),
			});
		}
	);

	const UpdateLastSeenTag = catchGrpcErrors(async (call, callback) => {
		const { id, tag } = call.request;
		await repository.updateLastSeenTag(Number(id), tag);
		callback(null, {});
	});

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
