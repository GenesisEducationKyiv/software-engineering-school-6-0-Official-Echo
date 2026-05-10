import {
	loadPackageDefinition,
	Server,
	ServerCredentials,
	status,
} from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { join } from "path";

import {
	confirm,
	ConfirmError,
	getSubscriptions,
	GetSubscriptionsError,
	subscribe,
	SubscribeError,
	unsubscribe,
	UnsubscribeError,
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

async function Subscribe(call, callback) {
	const { email, repo } = call.request;
	const result = subscribe(email, repo);

	if (!result.ok) {
		const codeMap = {
			[SubscribeError.MISSING_FIELDS]: status.INVALID_ARGUMENT,
			[SubscribeError.INVALID_EMAIL]: status.INVALID_ARGUMENT,
			[SubscribeError.INVALID_REPO_FORMAT]: status.INVALID_ARGUMENT,
			[SubscribeError.REPO_NOT_FOUND]: status.NOT_FOUND,
			[SubscribeError.RATE_LIMITED]: status.RESOURCE_EXHAUSTED,
			[SubscribeError.ALREADY_EXISTS]: status.ALREADY_EXISTS,
			[SubscribeError.INTERNAL]: status.INTERNAL,
		};
		return callback({
			code: codeMap[result.code] ?? status.INTERNAL,
			message: result.error,
		});
	}

	callback(null, { message: result.message });
}

function Confirm(call, callback) {
	const { token } = call.request;
	const result = confirm(token);

	if (!result.ok) {
		const codeMap = {
			[ConfirmError.MISSING_TOKEN]: status.INVALID_ARGUMENT,
			[ConfirmError.NOT_FOUND]: status.NOT_FOUND,
		};
		return callback({
			code: codeMap[result.code] ?? status.INVALID_ARGUMENT,
			message: result.error,
		});
	}

	callback(null, { message: result.message });
}

function Unsubscribe(call, callback) {
	const { token } = call.request;
	const result = unsubscribe(token);

	if (!result.ok) {
		const codeMap = {
			[UnsubscribeError.MISSING_TOKEN]: status.INVALID_ARGUMENT,
			[UnsubscribeError.NOT_FOUND]: status.NOT_FOUND,
		};
		return callback({
			code: codeMap[result.code] ?? status.INVALID_ARGUMENT,
			message: result.error,
		});
	}

	callback(null, { message: result.message });
}

function GetSubscriptions(call, callback) {
	const { email } = call.request;
	const result = getSubscriptions(email);

	if (!result.ok) {
		const codeMap = {
			[GetSubscriptionsError.INVALID_EMAIL]: status.INVALID_ARGUMENT,
		};
		return callback({
			code: codeMap[result.code] ?? status.INVALID_ARGUMENT,
			message: result.error,
		});
	}

	callback(null, {
		subscriptions: result.subscriptions.map((s) => ({
			email: s.email,
			repo: s.repo,
			confirmed: s.confirmed,
			last_seen_tag: s.last_seen_tag || "",
		})),
	});
}

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
