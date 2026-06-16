export class AppError extends Error {
	/**
	 * @param {string} message User-facing message
	 * @param {string} code    Machine-readable error code
	 */
	constructor(message, code) {
		super(message);
		this.name = this.constructor.name;
		this.code = code;
		Error.captureStackTrace(this, this.constructor);
	}
}

export class ValidationError extends AppError {}
export class NotFoundError extends AppError {}
export class ConflictError extends AppError {}

export class RateLimitError extends AppError {
	constructor(message, code, retryAfter = 60) {
		super(message, code);
		this.retryAfter = retryAfter;
	}
}

export class UnauthorizedError extends AppError {}
export class ForbiddenError extends AppError {}
