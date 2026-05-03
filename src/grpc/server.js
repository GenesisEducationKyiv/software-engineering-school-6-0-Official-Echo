import {
	loadPackageDefinition,
	Server,
	ServerCredentials,
	status,
} from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";

import { getDb } from "../db/database.js";
import {
	CONFIRM_SUBSCRIPTION_BY_TOKEN,
	DELETE_SUBSCRIPTION_BY_TOKEN,
	GET_SUBSCRIPTIONS_BY_EMAIL,
	INSERT_SUBSCRIPTION,
} from "../db/queries/subscription.js";
import { isValidRepoFormat, repoExists } from "../services/github.js";
import { sendConfirmationEmail } from "../services/notifier.js";

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

	if (!email || !repo) {
		return callback({
			code: status.INVALID_ARGUMENT,
			message: "email and repo are required",
		});
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return callback({
			code: status.INVALID_ARGUMENT,
			message: "Invalid email address",
		});
	}
	if (!isValidRepoFormat(repo)) {
		return callback({
			code: status.INVALID_ARGUMENT,
			message: "Invalid repo format. Use owner/repo",
		});
	}

	try {
		const exists = await repoExists(repo);
		if (!exists) {
			return callback({
				code: status.NOT_FOUND,
				message: `Repository "${repo}" not found`,
			});
		}
	} catch (err) {
		if (err.status === 429) {
			return callback({
				code: status.RESOURCE_EXHAUSTED,
				message: "GitHub rate limit exceeded",
			});
		}
		return callback({
			code: status.INTERNAL,
			message: "Failed to verify repository",
		});
	}

	const db = getDb();
	const confirmToken = uuidv4();
	const unsubscribeToken = uuidv4();

	try {
		db.prepare(INSERT_SUBSCRIPTION).run(
			email,
			repo,
			confirmToken,
			unsubscribeToken
		);
	} catch (err) {
		if (err.message.includes("UNIQUE constraint failed")) {
			return callback({
				code: status.ALREADY_EXISTS,
				message: "Already subscribed",
			});
		}
		return callback({ code: status.INTERNAL, message: "Database error" });
	}

	try {
		await sendConfirmationEmail({ email, repo, confirmToken });
	} catch (err) {
		console.error("[gRPC] Failed to send confirmation email:", err.message);
	}

	callback(null, {
		message: "Subscription created. Check your email to confirm.",
	});
}

function Confirm(call, callback) {
	const { token } = call.request;
	if (!token) {
		return callback({
			code: status.INVALID_ARGUMENT,
			message: "Invalid token",
		});
	}

	const db = getDb();
	const sub = db.prepare(CONFIRM_SUBSCRIPTION_BY_TOKEN).get(token);

	if (!sub) {
		return callback({ code: status.NOT_FOUND, message: "Token not found" });
	}
	if (sub.confirmed) return callback(null, { message: "Already confirmed" });

	db.prepare("UPDATE subscriptions SET confirmed = 1 WHERE confirm_token = ?").run(
		token
	);
	callback(null, { message: "Subscription confirmed successfully" });
}

function Unsubscribe(call, callback) {
	const { token } = call.request;
	if (!token) {
		return callback({
			code: status.INVALID_ARGUMENT,
			message: "Invalid token",
		});
	}

	const db = getDb();
	const result = db.prepare(DELETE_SUBSCRIPTION_BY_TOKEN).run(token);

	if (result.changes === 0) {
		return callback({ code: status.NOT_FOUND, message: "Token not found" });
	}
	callback(null, { message: "Unsubscribed successfully" });
}

function GetSubscriptions(call, callback) {
	const { email } = call.request;
	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return callback({
			code: status.INVALID_ARGUMENT,
			message: "Invalid email",
		});
	}

	const db = getDb();
	const rows = db.prepare(GET_SUBSCRIPTIONS_BY_EMAIL).all(email);

	callback(null, {
		subscriptions: rows.map((r) => ({
			email: r.email,
			repo: r.repo,
			confirmed: r.confirmed === 1,
			last_seen_tag: r.last_seen_tag || "",
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
