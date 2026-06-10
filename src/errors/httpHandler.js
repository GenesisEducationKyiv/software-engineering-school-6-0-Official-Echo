import { ReasonPhrases, StatusCodes } from "http-status-codes";

import { logger } from "../services/logger.js";
import { AppError } from "./index.js";

export const httpErrorHandler = (err, req, res, _next) => {
	if (err instanceof AppError) {
		const { status, body } = err.toHttp();
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
		return res.status(status).json(body);
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
