import { credentials, loadPackageDefinition } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { dirname, join } from "path";
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

const proto = loadPackageDefinition(packageDef).notifier;

/**
 * Wraps a gRPC callback-style method in a Promise so callers can use
 * async/await.
 *
 * @template T
 * @param {Function} method  Bound gRPC client method
 * @param {object}   request Protobuf request message
 * @returns {Promise<T>}
 */
function callAsync(method, request) {
	return new Promise((resolve, reject) => {
		method(request, (err, response) => {
			if (err) return reject(err);
			resolve(response);
		});
	});
}

/**
 * Creates a gRPC client for SubscriptionService.
 *
 * @param {string} [address] Host:port of the gRPC server.
 *                           Defaults to `localhost:50051` (or GRPC_PORT env var).
 * @returns {{
 *   subscribe:        (req: {email: string, repo: string})  => Promise<{message: string}>,
 *   confirm:          (req: {token: string})                => Promise<{message: string}>,
 *   unsubscribe:      (req: {token: string})                => Promise<{message: string}>,
 *   getSubscriptions: (req: {email: string})                => Promise<{subscriptions: object[]}>,
 *   close:            () => void,
 * }}
 */
export function createGrpcClient(address) {
	const target = address ?? `localhost:${process.env.GRPC_PORT ?? 50051}`;

	const stub = new proto.SubscriptionService(target, credentials.createInsecure());

	return {
		/**
		 * Subscribe — replaces:
		 *   axios.post(`${BASE_URL}/api/subscribe`, { email, repo })
		 *
		 * @param {{ email: string, repo: string }} req
		 */
		subscribe(req) {
			return callAsync(stub.Subscribe.bind(stub), req);
		},

		/**
		 * Confirm — replaces:
		 *   axios.get(`${BASE_URL}/api/confirm/${token}`)
		 *
		 * @param {{ token: string }} req
		 */
		confirm(req) {
			return callAsync(stub.Confirm.bind(stub), req);
		},

		/**
		 * Unsubscribe — replaces:
		 *   axios.get(`${BASE_URL}/api/unsubscribe/${token}`)
		 *
		 * @param {{ token: string }} req
		 */
		unsubscribe(req) {
			return callAsync(stub.Unsubscribe.bind(stub), req);
		},

		/**
		 * GetSubscriptions — replaces:
		 *   axios.get(`${BASE_URL}/api/subscriptions?email=${email}`)
		 *
		 * @param {{ email: string }} req
		 */
		getSubscriptions(req) {
			return callAsync(stub.GetSubscriptions.bind(stub), req);
		},

		/**
		 * Close the underlying HTTP/2 channel.  Call when the client is no
		 * longer needed to free the TCP connection.
		 */
		close() {
			stub.close();
		},
	};
}
