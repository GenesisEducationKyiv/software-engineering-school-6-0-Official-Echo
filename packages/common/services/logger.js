import pino from "pino";

const isDev = process.env.NODE_ENV === "development";

function buildTargets() {
	const targets = [];

	targets.push(
		isDev
			? { target: "pino-pretty", level: "debug", options: { colorize: true } }
			: { target: "pino/file", level: "info", options: { destination: 1 } }
	);

	const esUrl = process.env.ELASTICSEARCH_URL;
	if (esUrl) {
		targets.push({
			target: "pino-elasticsearch",
			level: "info",
			options: {
				node: esUrl,
				index: process.env.ELASTICSEARCH_INDEX || "ghchk-logs",
				esVersion: 8,
				flushBytes: 1000,
				flushInterval: 5000,
			},
		});
	}

	return targets;
}

export const logger = pino(
	{
		level: process.env.LOG_LEVEL || "info",
		base: {
			service: "ghchk",
			version: process.env.npm_package_version || "1.0.0",
		},
		timestamp: pino.stdTimeFunctions.isoTime,
		redact: {
			paths: [
				"req.headers.authorization",
				'req.headers["x-api-key"]',
				"password",
			],
			censor: "[REDACTED]",
		},
		serializers: {
			err: pino.stdSerializers.err,
			req: pino.stdSerializers.req,
		},
	},
	pino.transport({ targets: buildTargets() })
);

/**
 * Express middleware that emits a structured log for every request/response.
 */
export function createHttpLoggerMiddleware(logger) {
	return function httpLoggerMiddleware(req, res, next) {
		const startAt = process.hrtime.bigint();

		res.on("finish", () => {
			const durationMs = Number(process.hrtime.bigint() - startAt) / 1e6;
			let level = "info";

			if (res.statusCode >= 500) {
				level = "error";
			} else if (res.statusCode >= 400) {
				level = "warn";
			}

			logger[level](
				{
					req: { method: req.method, url: req.originalUrl, id: req.id },
					res: { statusCode: res.statusCode },
					durationMs,
				},
				"http request"
			);
		});

		next();
	};
}
