import { Status } from "nice-grpc-common";

import { grpcErrorsTotal, grpcRequestsTotal } from "../services/metrics.js";
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
 * Wraps a gRPC handler function with structured error catching and RED
 * metrics (`grpc_requests_total`, `grpc_errors_total`, labeled by method).
 * Unknown errors become `INTERNAL`.
 * @param {string} method   RPC method name, e.g. "Subscribe" — used as a metric label
 * @param {Function} handlerFn
 * @returns {Function}
 */
export const catchGrpcErrors = (method, handlerFn) => {
	return async (call, callback) => {
		grpcRequestsTotal.inc({ method });
		try {
			await handlerFn(call, callback);
		} catch (err) {
			grpcErrorsTotal.inc({ method });

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
