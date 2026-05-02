const path = require("path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const { v4: uuidv4 } = require("uuid");
const { getDb } = require("../db/database");
const { isValidRepoFormat, repoExists } = require("../services/github");
const { sendConfirmationEmail } = require("../services/notifier");

const PROTO_PATH = path.join(__dirname, "../../proto/notifier.proto");
const GRPC_PORT = process.env.GRPC_PORT || 50051;

const packageDef = protoLoader.loadSync(PROTO_PATH, {
	keepCase: true,
	longs: String,
	enums: String,
	defaults: true,
	oneofs: true,
});

const proto = grpc.loadPackageDefinition(packageDef).notifier;

async function Subscribe(call, callback) {
	const { email, repo } = call.request;

	if (!email || !repo) {
		return callback({
			code: grpc.status.INVALID_ARGUMENT,
			message: "email and repo are required",
		});
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return callback({
			code: grpc.status.INVALID_ARGUMENT,
			message: "Invalid email address",
		});
	}
	if (!isValidRepoFormat(repo)) {
		return callback({
			code: grpc.status.INVALID_ARGUMENT,
			message: "Invalid repo format. Use owner/repo",
		});
	}

	try {
		const exists = await repoExists(repo);
		if (!exists) {
			return callback({
				code: grpc.status.NOT_FOUND,
				message: `Repository "${repo}" not found`,
			});
		}
	} catch (err) {
		if (err.status === 429) {
			return callback({
				code: grpc.status.RESOURCE_EXHAUSTED,
				message: "GitHub rate limit exceeded",
			});
		}
		return callback({
			code: grpc.status.INTERNAL,
			message: "Failed to verify repository",
		});
	}

	const db = getDb();
	const confirmToken = uuidv4();
	const unsubscribeToken = uuidv4();

	try {
		db.prepare(
			`
      INSERT INTO subscriptions (email, repo, confirm_token, unsubscribe_token)
      VALUES (?, ?, ?, ?)
    `
		).run(email, repo, confirmToken, unsubscribeToken);
	} catch (err) {
		if (err.message.includes("UNIQUE constraint failed")) {
			return callback({
				code: grpc.status.ALREADY_EXISTS,
				message: "Already subscribed",
			});
		}
		return callback({ code: grpc.status.INTERNAL, message: "Database error" });
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
			code: grpc.status.INVALID_ARGUMENT,
			message: "Invalid token",
		});
	}

	const db = getDb();
	const sub = db
		.prepare("SELECT * FROM subscriptions WHERE confirm_token = ?")
		.get(token);

	if (!sub) {
		return callback({ code: grpc.status.NOT_FOUND, message: "Token not found" });
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
			code: grpc.status.INVALID_ARGUMENT,
			message: "Invalid token",
		});
	}

	const db = getDb();
	const result = db
		.prepare("DELETE FROM subscriptions WHERE unsubscribe_token = ?")
		.run(token);

	if (result.changes === 0) {
		return callback({ code: grpc.status.NOT_FOUND, message: "Token not found" });
	}
	callback(null, { message: "Unsubscribed successfully" });
}

function GetSubscriptions(call, callback) {
	const { email } = call.request;
	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return callback({
			code: grpc.status.INVALID_ARGUMENT,
			message: "Invalid email",
		});
	}

	const db = getDb();
	const rows = db
		.prepare(
			"SELECT email, repo, confirmed, last_seen_tag FROM subscriptions WHERE email = ?"
		)
		.all(email);

	callback(null, {
		subscriptions: rows.map((r) => ({
			email: r.email,
			repo: r.repo,
			confirmed: r.confirmed === 1,
			last_seen_tag: r.last_seen_tag || "",
		})),
	});
}

function startGrpcServer() {
	const server = new grpc.Server();
	server.addService(proto.SubscriptionService.service, {
		Subscribe,
		Confirm,
		Unsubscribe,
		GetSubscriptions,
	});

	server.bindAsync(
		`0.0.0.0:${GRPC_PORT}`,
		grpc.ServerCredentials.createInsecure(),
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

module.exports = { startGrpcServer };
