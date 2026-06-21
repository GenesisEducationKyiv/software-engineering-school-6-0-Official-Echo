export class AppError extends Error {
	constructor(message, code) {
		super(message);
		this.name = this.constructor.name;
		this.code = code;
	}
}

export class RateLimitError extends AppError {
	constructor(message, code, retryAfter = 60) {
		super(message, code);
		this.retryAfter = retryAfter;
	}
}
