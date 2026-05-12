import { loadPackageDefinition, Server, ServerCredentials } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { join } from "path";

import { catchGrpcErrors } from "../errors/grpcHandler.js";
import {
	confirm,
	getSubscriptions,
	subscribe,
	unsubscribe,
} from "../services/subscriptionService.js";

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

const Subscribe = catchGrpcErrors(async (call, callback) => {
	const { email, repo } = call.request;
	const result = await subscribe(email, repo);
	callback(null, { message: result.message });
});

const Confirm = catchGrpcErrors((call, callback) => {
	const { token } = call.request;
	const result = confirm(token);
	callback(null, { message: result.message });
});

const Unsubscribe = catchGrpcErrors((call, callback) => {
	const { token } = call.request;
	const result = unsubscribe(token);
	callback(null, { message: result.message });
});

const GetSubscriptions = catchGrpcErrors((call, callback) => {
	const { email } = call.request;
	const result = getSubscriptions(email);
	callback(null, {
		subscriptions: result.subscriptions.map((s) => ({
			email: s.email,
			repo: s.repo,
			confirmed: s.confirmed,
			last_seen_tag: s.last_seen_tag || "",
		})),
	});
});

export function startGrpcServer() {
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
				console.error("[gRPC] Failed to start:", err.message);
				return;
			}
			console.log(`[gRPC] Server listening on port ${port}`);
		}
	);

	return server;
}
