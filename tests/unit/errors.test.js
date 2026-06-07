import { describe, expect, test, vi } from "vitest";

import { httpErrorHandler } from "#src/errors/httpHandler.js";
import {
	AppError,
	ConflictError,
	ForbiddenError,
	NotFoundError,
	RateLimitError,
	UnauthorizedError,
	ValidationError,
} from "#src/errors/index.js";

describe("AppError and subclasses", () => {
	test("ValidationError is an AppError with correct code", () => {
		const err = new ValidationError("bad input", "BAD");
		expect(err).toBeInstanceOf(AppError);
		expect(err.code).toBe("BAD");
		expect(err.message).toBe("bad input");
	});

	test("NotFoundError is an AppError with correct code", () => {
		const err = new NotFoundError("not found", "NF");
		expect(err).toBeInstanceOf(AppError);
		expect(err.code).toBe("NF");
	});

	test("ConflictError is an AppError with correct code", () => {
		const err = new ConflictError("conflict", "C");
		expect(err).toBeInstanceOf(AppError);
	});

	test("RateLimitError stores retryAfter (default 60)", () => {
		const err = new RateLimitError("slow down", "RL");
		expect(err.retryAfter).toBe(60);
	});

	test("RateLimitError stores custom retryAfter", () => {
		const err = new RateLimitError("slow down", "RL", 120);
		expect(err.retryAfter).toBe(120);
	});

	test("UnauthorizedError is an AppError", () => {
		const err = new UnauthorizedError("no auth", "NA");
		expect(err).toBeInstanceOf(AppError);
	});

	test("ForbiddenError is an AppError", () => {
		const err = new ForbiddenError("no perms", "NP");
		expect(err).toBeInstanceOf(AppError);
	});

	test("AppError sets name to constructor name", () => {
		const err = new NotFoundError("nope", "X");
		expect(err.name).toBe("NotFoundError");
	});

	test("all subclasses are instanceof AppError", () => {
		for (const Cls of [
			ValidationError,
			NotFoundError,
			ConflictError,
			RateLimitError,
			UnauthorizedError,
			ForbiddenError,
		]) {
			expect(new Cls("msg", "CODE")).toBeInstanceOf(AppError);
		}
	});

	test("errors no longer carry toHttp or toGrpc", () => {
		const err = new ValidationError("x", "Y");
		expect(err.toHttp).toBeUndefined();
		expect(err.toGrpc).toBeUndefined();
	});
});

function mockRes() {
	const res = {};
	res.status = vi.fn().mockReturnValue(res);
	res.json = vi.fn().mockReturnValue(res);
	return res;
}

describe("httpErrorHandler()", () => {
	test("ValidationError → 400", () => {
		const err = new ValidationError("Invalid email", "INVALID_EMAIL");
		const res = mockRes();
		httpErrorHandler(err, {}, res, vi.fn());
		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({
			code: "INVALID_EMAIL",
			error: "Invalid email",
		});
	});

	test("NotFoundError → 404", () => {
		const err = new NotFoundError("resource not found", "NF");
		const res = mockRes();
		httpErrorHandler(err, {}, res, vi.fn());
		expect(res.status).toHaveBeenCalledWith(404);
		expect(res.json).toHaveBeenCalledWith({
			code: "NF",
			error: "resource not found",
		});
	});

	test("ConflictError → 409", () => {
		const err = new ConflictError("already exists", "EXISTS");
		const res = mockRes();
		httpErrorHandler(err, {}, res, vi.fn());
		expect(res.status).toHaveBeenCalledWith(409);
	});

	test("RateLimitError → 429", () => {
		const err = new RateLimitError("slow down", "RL");
		const res = mockRes();
		httpErrorHandler(err, {}, res, vi.fn());
		expect(res.status).toHaveBeenCalledWith(429);
	});

	test("UnauthorizedError → 401", () => {
		const err = new UnauthorizedError("no auth", "NA");
		const res = mockRes();
		httpErrorHandler(err, {}, res, vi.fn());
		expect(res.status).toHaveBeenCalledWith(401);
	});

	test("ForbiddenError → 403", () => {
		const err = new ForbiddenError("no perms", "NP");
		const res = mockRes();
		httpErrorHandler(err, {}, res, vi.fn());
		expect(res.status).toHaveBeenCalledWith(403);
	});

	test("unknown error → 500 with INTERNAL_ERROR code", () => {
		const err = new Error("unexpected crash");
		const res = mockRes();
		httpErrorHandler(err, {}, res, vi.fn());
		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ code: "INTERNAL_ERROR" })
		);
	});
});
