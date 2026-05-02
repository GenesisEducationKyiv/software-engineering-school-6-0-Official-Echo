const API_KEY = process.env.API_KEY;

/**
 * Protects routes with an API key passed in the X-API-Key header.
 * If API_KEY env var is not set, auth is disabled (dev mode).
 */
function apiKeyAuth(req, res, next) {
	if (!API_KEY) return next();

	const provided = req.headers["x-api-key"];
	if (!provided) {
		return res.status(401).json({ error: "Missing X-API-Key header" });
	}
	if (provided !== API_KEY) {
		return res.status(403).json({ error: "Invalid API key" });
	}
	next();
}

export default { apiKeyAuth };
