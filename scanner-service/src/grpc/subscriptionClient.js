import { credentials, loadPackageDefinition } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { dirname,join } from "path";
import { fileURLToPath } from "url";

const protoPackage = fileURLToPath(import.meta.resolve("@ghchk/proto/package.json"));
const protoRoot = dirname(protoPackage);
const PROTO_PATH = join(protoRoot, "notifier", "v1", "notifier.proto");

const packageDef = loadSync(PROTO_PATH, {
	keepCase: true,
	longs: String,
	enums: String,
	defaults: true,
	oneofs: true,
});

const proto = loadPackageDefinition(packageDef).notifier.v1;

function call(method, request) {
	return new Promise((resolve, reject) => {
		method(request, (err, response) => {
			if (err) return reject(err);
			resolve(response);
		});
	});
}

export function createSubscriptionClient(address) {
	const target =
		address ?? process.env.SUBSCRIPTION_SERVICE_GRPC_ADDR ?? "localhost:50051";

	const stub = new proto.SubscriptionService(target, credentials.createInsecure());

	return {
		async findConfirmedRepos() {
			const res = await call(stub.FindConfirmedRepos.bind(stub), {});
			return res.repos ?? [];
		},

		async findConfirmedSubscribersByRepo(repo) {
			const res = await call(stub.FindConfirmedSubscribersByRepo.bind(stub), {
				repo,
			});
			return (res.subscribers ?? []).map((s) => ({
				id: Number(s.id),
				email: s.email,
				unsubscribe_token: s.unsubscribe_token,
				last_seen_tag: s.last_seen_tag || null,
			}));
		},

		async updateLastSeenTag(id, tag) {
			await call(stub.UpdateLastSeenTag.bind(stub), { id: String(id), tag });
		},

		close() {
			stub.close();
		},
	};
}
