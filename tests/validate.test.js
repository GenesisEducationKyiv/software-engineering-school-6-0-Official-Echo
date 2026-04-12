const { validate, validateEmail } = require("../src/middleware/validate");

function mockRes() {
	const res = {};
	res.status = jest.fn().mockReturnValue(res);
	res.json = jest.fn().mockReturnValue(res);
	return res;
}

describe("validate middleware", () => {
	test("calls next() when all fields present", () => {
		const req = { body: { email: "a@b.com", repo: "x/y" } };
		const res = mockRes();
		const next = jest.fn();
		validate(["email", "repo"])(req, res, next);
		expect(next).toHaveBeenCalled();
		expect(res.status).not.toHaveBeenCalled();
	});

	test("returns 400 when field is missing", () => {
		const req = { body: { email: "a@b.com" } };
		const res = mockRes();
		const next = jest.fn();
		validate(["email", "repo"])(req, res, next);
		expect(res.status).toHaveBeenCalledWith(400);
		expect(next).not.toHaveBeenCalled();
	});
});

describe("validateEmail middleware", () => {
	test("calls next() for valid email", () => {
		const req = { body: { email: "user@example.com" } };
		const res = mockRes();
		const next = jest.fn();
		validateEmail(req, res, next);
		expect(next).toHaveBeenCalled();
	});

	test("returns 400 for invalid email", () => {
		const req = { body: { email: "not-an-email" } };
		const res = mockRes();
		const next = jest.fn();
		validateEmail(req, res, next);
		expect(res.status).toHaveBeenCalledWith(400);
		expect(next).not.toHaveBeenCalled();
	});
});
