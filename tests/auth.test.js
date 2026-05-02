function mockRes() {
	const res = {};
	res.status = jest.fn().mockReturnValue(res);
	res.json = jest.fn().mockReturnValue(res);
	return res;
}

describe("apiKeyAuth middleware", () => {
	const OLD_ENV = process.env;

	beforeEach(() => {
		jest.resetModules();
		process.env = { ...OLD_ENV };
	});

	afterAll(() => {
		process.env = OLD_ENV;
	});

	test("calls next() when API_KEY env var is not set (auth disabled)", () => {
		delete process.env.API_KEY;
		const { apiKeyAuth: mw } = require("../src/middleware/auth");
		const next = jest.fn();
		mw({ headers: {} }, mockRes(), next);
		expect(next).toHaveBeenCalled();
	});

	test("returns 401 when header is missing", () => {
		process.env.API_KEY = "secret123";
		const { apiKeyAuth: mw } = require("../src/middleware/auth");
		const res = mockRes();
		const next = jest.fn();
		mw({ headers: {} }, res, next);
		expect(res.status).toHaveBeenCalledWith(401);
		expect(next).not.toHaveBeenCalled();
	});

	test("returns 403 when key is wrong", () => {
		process.env.API_KEY = "secret123";
		const { apiKeyAuth: mw } = require("../src/middleware/auth");
		const res = mockRes();
		const next = jest.fn();
		mw({ headers: { "x-api-key": "wrongkey" } }, res, next);
		expect(res.status).toHaveBeenCalledWith(403);
		expect(next).not.toHaveBeenCalled();
	});

	test("calls next() when key matches", () => {
		process.env.API_KEY = "secret123";
		const { apiKeyAuth: mw } = require("../src/middleware/auth");
		const next = jest.fn();
		mw({ headers: { "x-api-key": "secret123" } }, mockRes(), next);
		expect(next).toHaveBeenCalled();
	});
});
