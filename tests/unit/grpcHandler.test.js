import { Status } from "nice-grpc-common";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { catchGrpcErrors } from "#src/errors/grpcHandler.js";
import {
	ConflictError,
	ForbiddenError,
	NotFoundError,
	RateLimitError,
	UnauthorizedError,
	ValidationError,
} from "#src/errors/index.js";
import {
	grpcErrorsTotal,
	grpcRequestsTotal,
	register,
} from "#src/services/metrics.js";

function labelsMatch(actual, expected) {
	return Object.entries(expected).every(
		([key, value]) => String(actual[key]) === String(value)
	);
}

async function counterValue(counter, labels) {
	const { values } = await counter.get();
	return values.find((v) => labelsMatch(v.labels, labels))?.value ?? 0;
}

describe("catchGrpcErrors", () => {
	beforeEach(() => {
		register.resetMetrics();
		vi.restoreAllMocks();
	});

	test("increments grpcRequestsTotal on every call, regardless of outcome", async () => {
		const handler = catchGrpcErrors("Subscribe", async () => {});
		await handler({}, vi.fn());

		expect(await counterValue(grpcRequestsTotal, { method: "Subscribe" })).toBe(
			1
		);
	});

	test("counts each call to the same method independently", async () => {
		const handler = catchGrpcErrors("Confirm", async () => {});
		await handler({}, vi.fn());
		await handler({}, vi.fn());
		await handler({}, vi.fn());

		expect(await counterValue(grpcRequestsTotal, { method: "Confirm" })).toBe(3);
	});

	test("does not increment grpcErrorsTotal when the handler succeeds", async () => {
		const handler = catchGrpcErrors("GetSubscriptions", async () => {});
		await handler({}, vi.fn());

		expect(
			await counterValue(grpcErrorsTotal, { method: "GetSubscriptions" })
		).toBe(0);
	});

	test("passes call/callback through to the wrapped handler on success", async () => {
		const inner = vi.fn();
		const handler = catchGrpcErrors("Subscribe", inner);
		const call = { request: { email: "a@b.com" } };
		const callback = vi.fn();

		await handler(call, callback);

		expect(inner).toHaveBeenCalledWith(call, callback);
	});

	test.each([
		[ValidationError, Status.INVALID_ARGUMENT],
		[NotFoundError, Status.NOT_FOUND],
		[ConflictError, Status.ALREADY_EXISTS],
		[RateLimitError, Status.RESOURCE_EXHAUSTED],
		[UnauthorizedError, Status.UNAUTHENTICATED],
		[ForbiddenError, Status.PERMISSION_DENIED],
	])("maps %s to the correct gRPC status", async (ErrorClass, expectedStatus) => {
		const callback = vi.fn();
		const handler = catchGrpcErrors("Unsubscribe", async () => {
			throw new ErrorClass("boom", "SOME_CODE");
		});

		await handler({}, callback);

		expect(callback).toHaveBeenCalledWith({
			code: expectedStatus,
			message: "boom",
		});
	});

	test("increments grpcErrorsTotal when the handler throws a known AppError", async () => {
		const handler = catchGrpcErrors("UpdateLastSeenTag", async () => {
			throw new ValidationError("bad input", "INVALID_UPDATE_INPUT");
		});

		await handler({}, vi.fn());

		expect(
			await counterValue(grpcErrorsTotal, { method: "UpdateLastSeenTag" })
		).toBe(1);
	});

	test("maps unknown errors to INTERNAL and increments grpcErrorsTotal", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const callback = vi.fn();
		const handler = catchGrpcErrors("FindConfirmedRepos", async () => {
			throw new Error("unexpected");
		});

		await handler({}, callback);

		expect(callback).toHaveBeenCalledWith({
			code: Status.INTERNAL,
			message: "Internal server error",
		});
		expect(
			await counterValue(grpcErrorsTotal, { method: "FindConfirmedRepos" })
		).toBe(1);
	});
});
