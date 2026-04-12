// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
	console.error(`[Error] ${req.method} ${req.path} —`, err.message);
	if (res.headersSent) return;
	const status = err.status || err.statusCode || 500;
	res.status(status).json({ error: err.message || "Internal server error" });
}

module.exports = { errorHandler };
