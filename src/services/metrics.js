import { createKafkaProducerMetrics } from "@ghchk/common/services/metrics.js";
import {
	collectDefaultMetrics,
	Counter,
	Gauge,
	Histogram,
	Registry,
} from "prom-client";

export const register = new Registry();
collectDefaultMetrics({ register });

export const httpRequestsTotal = new Counter({
	name: "http_requests_total",
	help: "Total number of HTTP requests",
	labelNames: ["method", "route", "status"],
	registers: [register],
});

export const httpRequestDuration = new Histogram({
	name: "http_request_duration_seconds",
	help: "HTTP request duration in seconds",
	labelNames: ["method", "route", "status"],
	buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
	registers: [register],
});

export const httpErrorsTotal = new Counter({
	name: "http_errors_total",
	help: "Total number of HTTP error responses (4xx and 5xx)",
	labelNames: ["method", "route", "status"],
	registers: [register],
});

export const subscriptionsTotal = new Gauge({
	name: "subscriptions_total",
	help: "Total number of subscriptions in DB",
	registers: [register],
});

export const confirmedSubscriptionsTotal = new Gauge({
	name: "confirmed_subscriptions_total",
	help: "Number of confirmed subscriptions",
	registers: [register],
});

export const { kafkaProducerMessagesTotal, kafkaProducerErrorsTotal } =
	createKafkaProducerMetrics(register);

export const kafkaConsumerMessagesTotal = new Counter({
	name: "kafka_consumer_messages_total",
	help: "Total number of messages consumed from Kafka",
	labelNames: ["topic", "event_type"],
	registers: [register],
});

export const kafkaConsumerErrorsTotal = new Counter({
	name: "kafka_consumer_errors_total",
	help: "Total number of messages skipped due to processing errors",
	labelNames: ["topic", "event_type"],
	registers: [register],
});

export const grpcRequestsTotal = new Counter({
	name: "grpc_requests_total",
	help: "Total number of gRPC requests received",
	labelNames: ["method"],
	registers: [register],
});

export const grpcErrorsTotal = new Counter({
	name: "grpc_errors_total",
	help: "Total number of gRPC requests that resulted in an error",
	labelNames: ["method"],
	registers: [register],
});

/**
 * Express middleware that records RED metrics:
 *   Rate    — http_requests_total
 *   Errors  — http_errors_total  (4xx + 5xx)
 *   Duration— http_request_duration_seconds
 */
export function metricsMiddleware(req, res, next) {
	const end = httpRequestDuration.startTimer();
	res.on("finish", () => {
		const route = req.route?.path || req.path;
		const labels = { method: req.method, route, status: res.statusCode };
		httpRequestsTotal.inc(labels);
		end(labels);
		if (res.statusCode >= 400) {
			httpErrorsTotal.inc(labels);
		}
	});
	next();
}
