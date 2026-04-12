/**
 * Validates that required fields are present in req.body.
 * Usage: validate(['email', 'repo'])
 */
function validate(fields) {
	return (req, res, next) => {
		const missing = fields.filter((f) => !req.body[f]);
		if (missing.length > 0) {
			return res.status(400).json({
				error: `Missing required fields: ${missing.join(", ")}`,
			});
		}
		next();
	};
}

/**
 * Validates email format in req.body.email.
 */
function validateEmail(req, res, next) {
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email)) {
		return res.status(400).json({ error: "Invalid email address" });
	}
	next();
}

module.exports = { validate, validateEmail };
