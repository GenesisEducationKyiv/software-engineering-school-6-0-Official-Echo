import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, test } from "vitest";

import {
	httpErrorsTotal,
	httpRequestDuration,
	httpRequestsTotal,
	metricsMiddleware,
	register,
} from "#src/services/metrics.js";

function makeReqRes({
	method = "GET",
	path = "/api/foo",
	routePath,
	statusCode = 200,
} = {}) {
	const req = { method, path, route: routePath ? { path: routePath } : undefined };
	const res = new EventEmitter();
	res.statusCode = statusCode;
	return { req, res };
}

function labelsMatch(actual, expected) {
	return Object.entries(expected).every(
		([key, value]) => String(actual[key]) === String(value)
	);
}

function counterValue(counter, labels) {
	const { values } = counter.get();
	return values.find((v) => labelsMatch(v.labels, labels))?.value ?? 0;
}

function histogramSampleCount(histogram, labels) {
	const { values } = histogram.get();
	const match = values.find(
		(v) => v.metricName.endsWith("_count") && labelsMatch(v.labels, labels)
	);
	return match?.value ?? 0;
}

function runMiddleware({ method, path, routePath, statusCode }) {
	return new Promise((resolve) => {
		const { req, res } = makeReqRes({ method, path, routePath, statusCode });
		metricsMiddleware(req, res, () => {
			res.emit("finish");
			resolve({ req, res });
		});
	});
}

describe("metricsMiddleware", () => {
	beforeEach(() => register.resetMetrics());

	test("calls next() so the request isn't blocked", async () => {
		const { req, res } = makeReqRes();
		let called = false;
		metricsMiddleware(req, res, () => {
			called = true;
		});
		expect(called).toBe(true);
	});

	test("increments httpRequestsTotal with method/route/status on finish", async () => {
		await runMiddleware({
			method: "GET",
			path: "/api/subscriptions",
			statusCode: 200,
		});

		expect(
			counterValue(httpRequestsTotal, {
				method: "GET",
				route: "/api/subscriptions",
				status: 200,
			})
		).toBe(1);
	});

	test("does not record anything before the response finishes", () => {
		const { req, res } = makeReqRes({ statusCode: 200 });
		metricsMiddleware(req, res, () => {});

		expect(
			counterValue(httpRequestsTotal, { method: "GET", route: "/api/foo" })
		).toBe(0);
	});

	test("prefers the matched Express route pattern over the raw path", async () => {
		await runMiddleware({
			method: "GET",
			path: "/api/confirm/abc123",
			routePath: "/api/confirm/:token",
			statusCode: 200,
		});

		expect(
			counterValue(httpRequestsTotal, {
				method: "GET",
				route: "/api/confirm/:token",
				status: 200,
			})
		).toBe(1);
	});

	test("falls back to req.path when no route matched (e.g. 404s)", async () => {
		await runMiddleware({
			method: "GET",
			path: "/does-not-exist",
			statusCode: 404,
		});

		expect(
			counterValue(httpRequestsTotal, {
				method: "GET",
				route: "/does-not-exist",
				status: 404,
			})
		).toBe(1);
	});

	test("records request duration under the same labels", async () => {
		await runMiddleware({
			method: "POST",
			path: "/api/subscribe",
			statusCode: 201,
		});

		expect(
			histogramSampleCount(httpRequestDuration, {
				method: "POST",
				route: "/api/subscribe",
				status: 201,
			})
		).toBe(1);
	});

	test.each([400, 404, 429, 500, 503])(
		"increments httpErrorsTotal for a %i response",
		async (statusCode) => {
			await runMiddleware({ method: "GET", path: "/api/foo", statusCode });

			expect(
				counterValue(httpErrorsTotal, {
					method: "GET",
					route: "/api/foo",
					statusCode,
				})
			).toBe(0);

			expect(
				counterValue(httpErrorsTotal, {
					method: "GET",
					route: "/api/foo",
					status: statusCode,
				})
			).toBe(1);
		}
	);

	test.each([200, 201, 204, 301, 302])(
		"does not increment httpErrorsTotal for a %i response",
		async (statusCode) => {
			await runMiddleware({ method: "GET", path: "/api/foo", statusCode });

			expect(
				counterValue(httpErrorsTotal, {
					method: "GET",
					route: "/api/foo",
					status: statusCode,
				})
			).toBe(0);
		}
	);

	test("counts multiple requests to the same route independently by status", async () => {
		await runMiddleware({ method: "GET", path: "/api/foo", statusCode: 200 });
		await runMiddleware({ method: "GET", path: "/api/foo", statusCode: 200 });
		await runMiddleware({ method: "GET", path: "/api/foo", statusCode: 500 });

		expect(
			counterValue(httpRequestsTotal, {
				method: "GET",
				route: "/api/foo",
				status: 200,
			})
		).toBe(2);
		expect(
			counterValue(httpRequestsTotal, {
				method: "GET",
				route: "/api/foo",
				status: 500,
			})
		).toBe(1);
		expect(
			counterValue(httpErrorsTotal, {
				method: "GET",
				route: "/api/foo",
				status: 500,
			})
		).toBe(1);
	});
});
