import { loadPackageDefinition, Server, ServerCredentials } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { join } from "path";

import { catchGrpcErrors } from "../errors/grpcHandler.js";
import { logger } from "../services/logger.js";

const PROTO_PATH = join(import.meta.dirname, "../../proto/notifier.proto");
const GRPC_PORT = process.env.GRPC_PORT || 50051;

const packageDef = loadSync(PROTO_PATH, {
	keepCase: true,
	longs: String,
	enums: String,
	defaults: true,
	oneofs: true,
});

const proto = loadPackageDefinition(packageDef).notifier;

/**
 * Creates and starts the gRPC server.
 * @param {{ subscribe: Function, confirm: Function, unsubscribe: Function, getSubscriptions: Function }} subscriptionService
 * @returns {Server}
 */
export function startGrpcServer(subscriptionService) {
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

	const server = new Server();
	server.addService(proto.SubscriptionService.service, {
		Subscribe,
		Confirm,
		Unsubscribe,
		GetSubscriptions,
	});

	server.bindAsync(
		`0.0.0.0:${GRPC_PORT}`,
		ServerCredentials.createInsecure(),
		(err, port) => {
			if (err) {
				logger.error({ err }, "[gRPC] Failed to start");
				return;
			}
			logger.info({ port }, "[gRPC] Server listening");
		}
	);

	return server;
}
