import { ValidityError } from "../errors/constants/validate.js";
import { ValidationError } from "../errors/index.js";

/**
 * Validates that required fields are present in req.body.
 * Usage: validate(['email', 'repo'])
 * @throws { ValidationError }
 */
function validate(fields) {
	return (req, _res, next) => {
		const missing = fields.filter((f) => !req.body[f]);
		if (missing.length > 0) {
			throw new ValidationError(
				`Missing required fields: ${missing.join(", ")}`,
				ValidityError.MISSING_FIELDS
			);
		}
		next();
	};
}

/**
 * Validates email format in req.body.email.
 * @throws { ValidationError }
 */
function validateEmail(req, _res, next) {
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email)) {
		throw new ValidationError(
			"Invalid email address",
			ValidityError.INVALID_EMAIL_ADDRESS
		);
	}
	next();
}

export { validate, validateEmail };
