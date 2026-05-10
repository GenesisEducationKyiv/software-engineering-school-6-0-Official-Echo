import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

function mockRes() {
	const res = {};
	res.status = vi.fn().mockReturnValue(res);
	res.json = vi.fn().mockReturnValue(res);
	return res;
}

describe("apiKeyAuth middleware", () => {
	const OLD_ENV = process.env;

	beforeEach(() => {
		vi.resetModules();
		process.env = { ...OLD_ENV };
	});

	afterAll(() => {
		process.env = OLD_ENV;
	});

	test("calls next() when API_KEY env var is not set (auth disabled)", async () => {
		delete process.env.API_KEY;
		const { apiKeyAuth } = await import("../src/middleware/auth.js");
		const next = vi.fn();
		apiKeyAuth({ headers: {} }, mockRes(), next);
		expect(next).toHaveBeenCalled();
	});

	test("returns unauthorized when header is missing", async () => {
		process.env.API_KEY = "secret123";
		const { apiKeyAuth } = await import("../src/middleware/auth.js");
		const { UnauthorizedError } = await import("../src/errors/index.js");
		const res = mockRes();
		const next = vi.fn();
		apiKeyAuth({ headers: {} }, res, next);
		expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
	});

	test("returns forbidden when key is wrong", async () => {
		process.env.API_KEY = "secret123";
		const { apiKeyAuth } = await import("../src/middleware/auth.js");
		const { ForbiddenError } = await import("../src/errors/index.js");
		const res = mockRes();
		const next = vi.fn();
		apiKeyAuth({ headers: { "x-api-key": "wrongkey" } }, res, next);
		expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
	});

	test("calls next() when key matches", async () => {
		process.env.API_KEY = "secret123";
		const { apiKeyAuth } = await import("../src/middleware/auth.js");
		const next = vi.fn();
		apiKeyAuth({ headers: { "x-api-key": "secret123" } }, mockRes(), next);
		expect(next).toHaveBeenCalled();
	});
});
