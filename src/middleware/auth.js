import { ForbiddenError, UnauthorizedError } from "../errors/index.js";

/**
 * Protects routes with an API key passed in the X-API-Key header.
 * If API_KEY env var is not set, auth is disabled.
 */
export function apiKeyAuth(req, _res, next) {
	const API_KEY = process.env.API_KEY;
	if (!API_KEY) return next();

	const provided = req.headers["x-api-key"];
	if (!provided) {
		return next(
			new UnauthorizedError("Missing X-API-Key header", "MISSING_API_KEY")
		);
	}
	if (provided !== API_KEY) {
		return next(new ForbiddenError("Invalid API key", "INVALID_API_KEY"));
	}
	next();
}
