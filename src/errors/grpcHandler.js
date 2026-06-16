import { Status } from "nice-grpc-common";

import {
	AppError,
	ConflictError,
	ForbiddenError,
	NotFoundError,
	RateLimitError,
	UnauthorizedError,
	ValidationError,
} from "./index.js";

/** @type {Map<typeof AppError, Status>} */
const GRPC_STATUS_MAP = new Map([
	[ValidationError, Status.INVALID_ARGUMENT],
	[NotFoundError, Status.NOT_FOUND],
	[ConflictError, Status.ALREADY_EXISTS],
	[RateLimitError, Status.RESOURCE_EXHAUSTED],
	[UnauthorizedError, Status.UNAUTHENTICATED],
	[ForbiddenError, Status.PERMISSION_DENIED],
]);

/**
 * Wraps a gRPC handler function with structured error catching.
 * Unknown errors become `INTERNAL`.
 * @param {Function} handlerFn
 * @returns {Function}
 */
export const catchGrpcErrors = (handlerFn) => {
	return async (call, callback) => {
		try {
			await handlerFn(call, callback);
		} catch (err) {
			if (err instanceof AppError) {
				const code = GRPC_STATUS_MAP.get(err.constructor) ?? Status.INTERNAL;
				return callback({ code, message: err.message });
			}

			console.error("[Unexpected gRPC Error]", err);
			return callback({
				code: Status.INTERNAL,
				message: "Internal server error",
			});
		}
	};
};
