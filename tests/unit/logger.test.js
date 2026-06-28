import { EventEmitter } from "node:events";

import { describe, expect, test, vi } from "vitest";

import { createHttpLoggerMiddleware } from "#src/services/logger.js";

function makeReqRes({
	method = "GET",
	originalUrl = "/api/foo",
	id = "req-1",
	statusCode = 200,
} = {}) {
	const req = { method, originalUrl, id };
	const res = new EventEmitter();
	res.statusCode = statusCode;
	return { req, res };
}

function makeLogger() {
	return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

describe("createHttpLoggerMiddleware", () => {
	test("calls next() so the request isn't blocked", () => {
		const middleware = createHttpLoggerMiddleware(makeLogger());
		const { req, res } = makeReqRes();
		let called = false;

		middleware(req, res, () => {
			called = true;
		});

		expect(called).toBe(true);
	});

	test("does not log before the response finishes", () => {
		const logger = makeLogger();
		const middleware = createHttpLoggerMiddleware(logger);
		const { req, res } = makeReqRes();

		middleware(req, res, () => {});

		expect(logger.info).not.toHaveBeenCalled();
	});

	test("logs at info level with request/response details for a 2xx response", () => {
		const logger = makeLogger();
		const middleware = createHttpLoggerMiddleware(logger);
		const { req, res } = makeReqRes({ statusCode: 200 });

		middleware(req, res, () => {});
		res.emit("finish");

		expect(logger.info).toHaveBeenCalledOnce();
		expect(logger.warn).not.toHaveBeenCalled();
		expect(logger.error).not.toHaveBeenCalled();

		const [payload, message] = logger.info.mock.calls[0];
		expect(message).toBe("http request");
		expect(payload.req).toEqual({ method: "GET", url: "/api/foo", id: "req-1" });
		expect(payload.res).toEqual({ statusCode: 200 });
		expect(typeof payload.durationMs).toBe("number");
	});

	test("logs at warn level for a 4xx response", () => {
		const logger = makeLogger();
		const middleware = createHttpLoggerMiddleware(logger);
		const { req, res } = makeReqRes({ statusCode: 404 });

		middleware(req, res, () => {});
		res.emit("finish");

		expect(logger.warn).toHaveBeenCalledOnce();
		expect(logger.info).not.toHaveBeenCalled();
		expect(logger.error).not.toHaveBeenCalled();
	});

	test("logs at error level for a 5xx response", () => {
		const logger = makeLogger();
		const middleware = createHttpLoggerMiddleware(logger);
		const { req, res } = makeReqRes({ statusCode: 503 });

		middleware(req, res, () => {});
		res.emit("finish");

		expect(logger.error).toHaveBeenCalledOnce();
		expect(logger.info).not.toHaveBeenCalled();
		expect(logger.warn).not.toHaveBeenCalled();
	});
});
