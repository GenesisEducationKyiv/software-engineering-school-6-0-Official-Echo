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
	test("ValidationError has httpStatus 400", () => {
		const err = new ValidationError("bad input", "BAD");
		expect(err.httpStatus).toBe(400);
	});

	test("NotFoundError has httpStatus 404", () => {
		const err = new NotFoundError("not found", "NF");
		expect(err.httpStatus).toBe(404);
	});

	test("ConflictError has httpStatus 409", () => {
		const err = new ConflictError("conflict", "C");
		expect(err.httpStatus).toBe(409);
	});

	test("RateLimitError has httpStatus 429", () => {
		const err = new RateLimitError("slow down", "RL");
		expect(err.httpStatus).toBe(429);
	});

	test("RateLimitError stores retryAfter (default 60)", () => {
		const err = new RateLimitError("slow down", "RL");
		expect(err.retryAfter).toBe(60);
	});

	test("RateLimitError stores custom retryAfter", () => {
		const err = new RateLimitError("slow down", "RL", 120);
		expect(err.retryAfter).toBe(120);
	});

	test("UnauthorizedError has httpStatus 401", () => {
		const err = new UnauthorizedError("no auth", "NA");
		expect(err.httpStatus).toBe(401);
	});

	test("ForbiddenError has httpStatus 403", () => {
		const err = new ForbiddenError("no perms", "NP");
		expect(err.httpStatus).toBe(403);
	});

	test("toHttp() returns correct status and body", () => {
		const err = new ValidationError("Invalid email", "INVALID_EMAIL");
		const { status, body } = err.toHttp();
		expect(status).toBe(400);
		expect(body).toEqual({ code: "INVALID_EMAIL", error: "Invalid email" });
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
});

function mockRes() {
	const res = {};
	res.status = vi.fn().mockReturnValue(res);
	res.json = vi.fn().mockReturnValue(res);
	return res;
}

describe("httpErrorHandler()", () => {
	test("renders AppError with its own status and body", () => {
		const err = new NotFoundError("resource not found", "NF");
		const res = mockRes();
		httpErrorHandler(err, {}, res, vi.fn());
		expect(res.status).toHaveBeenCalledWith(404);
		expect(res.json).toHaveBeenCalledWith({
			code: "NF",
			error: "resource not found",
		});
	});

	test("returns 500 for non-AppError", () => {
		const err = new Error("unexpected crash");
		const res = mockRes();
		httpErrorHandler(err, {}, res, vi.fn());
		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ code: "INTERNAL_ERROR" })
		);
	});
});
