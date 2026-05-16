import { StatusCodes as httpStatus } from "http-status-codes";
import { Status as grpcStatus } from "nice-grpc-common";

export class AppError extends Error {
	/**
	 *
	 * @param {string} message User-facing message
	 * @param {string} code Message for internal development
	 * @param {number} httpStatus Error in HTTP code representation
	 * @param {number} grpcStatus Error in gRPC code representation
	 */
	constructor(message, code, httpStatus, grpcStatus) {
		super(message);
		this.name = this.constructor.name;
		this.code = code;
		this.httpStatus = httpStatus;
		this.grpcStatus = grpcStatus;
		Error.captureStackTrace(this, this.constructor);
	}

	toHttp() {
		return {
			status: this.httpStatus,
			body: { code: this.code, error: this.message },
		};
	}
	toGrpc() {
		return { code: this.grpcStatus, message: this.message };
	}
}

export class ValidationError extends AppError {
	constructor(message, code) {
		super(message, code, httpStatus.BAD_REQUEST, grpcStatus.INVALID_ARGUMENT);
	}
}

export class NotFoundError extends AppError {
	constructor(message, code) {
		super(message, code, httpStatus.NOT_FOUND, grpcStatus.NOT_FOUND);
	}
}

export class ConflictError extends AppError {
	constructor(message, code) {
		super(message, code, httpStatus.CONFLICT, grpcStatus.ALREADY_EXISTS);
	}
}

export class RateLimitError extends AppError {
	constructor(message, code, retryAfter = 60) {
		super(
			message,
			code,
			httpStatus.TOO_MANY_REQUESTS,
			grpcStatus.RESOURCE_EXHAUSTED
		);
		this.retryAfter = retryAfter;
	}
}

export class UnauthorizedError extends AppError {
	constructor(message, code) {
		super(message, code, httpStatus.UNAUTHORIZED, grpcStatus.UNAUTHENTICATED);
	}
}

export class ForbiddenError extends AppError {
	constructor(message, code) {
		super(message, code, httpStatus.FORBIDDEN, grpcStatus.PERMISSION_DENIED);
	}
}
