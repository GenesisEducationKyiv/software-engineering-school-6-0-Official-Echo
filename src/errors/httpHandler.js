import { ReasonPhrases, StatusCodes } from "http-status-codes";

import { AppError } from "./index.js";

export const httpErrorHandler = (err, _req, res, _next) => {
	if (err instanceof AppError) {
		const { status, body } = err.toHttp();
		return res.status(status).json(body);
	}

	console.error("[Unexpected HTTP Error]", err);
	return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
		code: "INTERNAL_ERROR",
		error: ReasonPhrases.INTERNAL_SERVER_ERROR,
	});
};
