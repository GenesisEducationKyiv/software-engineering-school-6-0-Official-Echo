import { Status } from "nice-grpc-common";

import { AppError } from "./index.js";

export const catchGrpcErrors = (handlerFn) => {
	return async (call, callback) => {
		try {
			await handlerFn(call, callback);
		} catch (err) {
			if (err instanceof AppError) {
				return callback(err.toGrpc());
			}

			console.error("[Unexpected gRPC Error]", err);
			return callback({
				code: Status.INTERNAL,
				message: "Internal server error",
			});
		}
	};
};
