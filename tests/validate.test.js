import { describe, expect, test, vi } from "vitest";

import { ValidationError } from "../src/errors/index.js";
import { validate, validateEmail } from "../src/middleware/validate.js";

function mockRes() {
	const res = {};
	res.status = vi.fn().mockReturnValue(res);
	res.json = vi.fn().mockReturnValue(res);
	return res;
}

describe("validate middleware", () => {
	test("calls next() when all fields present", () => {
		const req = { body: { email: "a@b.com", repo: "x/y" } };
		const next = vi.fn();
		validate(["email", "repo"])(req, mockRes(), next);
		expect(next).toHaveBeenCalled();
	});

	test("throws when field is missing", () => {
		const req = { body: { email: "a@b.com" } };
		expect(() => validate(["email", "repo"])(req, mockRes(), vi.fn())).toThrow(
			ValidationError
		);
	});
});

describe("validateEmail middleware", () => {
	test("calls next() for valid email", () => {
		const req = { body: { email: "user@example.com" } };
		const next = vi.fn();
		validateEmail(req, mockRes(), next);
		expect(next).toHaveBeenCalledWith();
	});

	test("throws for invalid email", () => {
		const req = { body: { email: "not-an-email" } };
		expect(() => validateEmail(req, mockRes(), vi.fn())).toThrow(
			ValidationError
		);
	});
});
