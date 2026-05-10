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

	test("returns 401 when header is missing", async () => {
		process.env.API_KEY = "secret123";
		const { apiKeyAuth } = await import("../src/middleware/auth.js");
		const res = mockRes();
		apiKeyAuth({ headers: {} }, res, vi.fn());
		expect(res.status).toHaveBeenCalledWith(401);
	});

	test("returns 403 when key is wrong", async () => {
		process.env.API_KEY = "secret123";
		const { apiKeyAuth } = await import("../src/middleware/auth.js");
		const res = mockRes();
		const next = vi.fn();
		apiKeyAuth({ headers: { "x-api-key": "wrongkey" } }, res, next);
		expect(res.status).toHaveBeenCalledWith(403);
		expect(next).not.toHaveBeenCalled();
	});

	test("calls next() when key matches", async () => {
		process.env.API_KEY = "secret123";
		const { apiKeyAuth } = await import("../src/middleware/auth.js");
		const next = vi.fn();
		apiKeyAuth({ headers: { "x-api-key": "secret123" } }, mockRes(), next);
		expect(next).toHaveBeenCalled();
	});
});
