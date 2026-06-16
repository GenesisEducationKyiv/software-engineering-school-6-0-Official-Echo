import { ReasonPhrases, StatusCodes } from "http-status-codes";

import { logger } from "../services/logger.js";
import {
	AppError,
	ConflictError,
	ForbiddenError,
	NotFoundError,
	RateLimitError,
	UnauthorizedError,
	ValidationError,
} from "./index.js";

/**
 * Maps each AppError subclass to its HTTP status code.
 * 
 * @type {Map<Function, number>}
 */
const HTTP_STATUS_MAP = new Map([
	[ValidationError, StatusCodes.BAD_REQUEST],
	[NotFoundError, StatusCodes.NOT_FOUND],
	[ConflictError, StatusCodes.CONFLICT],
	[RateLimitError, StatusCodes.TOO_MANY_REQUESTS],
	[UnauthorizedError, StatusCodes.UNAUTHORIZED],
	[ForbiddenError, StatusCodes.FORBIDDEN],
]);

/**
 * Express global error handler.
 * Translates AppError subclasses to HTTP responses.
 * Unknown errors become 500.
 */
export const httpErrorHandler = (err, req, res, _next) => {
	if (err instanceof AppError) {
		const status =
			HTTP_STATUS_MAP.get(err.constructor) ??
			StatusCodes.INTERNAL_SERVER_ERROR;
		if (status >= 500) {
			logger.error(
				{ err, req: { method: req.method, url: req.originalUrl } },
				"app error"
			);
		} else {
			logger.warn(
				{
					err: { message: err.message, code: err.code },
					req: { method: req.method, url: req.originalUrl },
				},
				"client error"
			);
		}
		return res.status(status).json({ code: err.code, error: err.message });
	}

	logger.error(
		{ err, req: { method: req.method, url: req.originalUrl } },
		"[Unexpected HTTP Error]"
	);
	return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
		code: "INTERNAL_ERROR",
		error: ReasonPhrases.INTERNAL_SERVER_ERROR,
	});
};
