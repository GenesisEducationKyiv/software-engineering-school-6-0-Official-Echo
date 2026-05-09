import {
	collectDefaultMetrics,
	Counter,
	Gauge,
	Histogram,
	Registry,
} from "prom-client";

const register = new Registry();
collectDefaultMetrics({ register });

const httpRequestsTotal = new Counter({
	name: "http_requests_total",
	help: "Total number of HTTP requests",
	labelNames: ["method", "route", "status"],
	registers: [register],
});

const httpRequestDuration = new Histogram({
	name: "http_request_duration_seconds",
	help: "HTTP request duration in seconds",
	labelNames: ["method", "route", "status"],
	buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
	registers: [register],
});

const subscriptionsTotal = new Gauge({
	name: "subscriptions_total",
	help: "Total number of subscriptions in DB",
	registers: [register],
});

const confirmedSubscriptionsTotal = new Gauge({
	name: "confirmed_subscriptions_total",
	help: "Number of confirmed subscriptions",
	registers: [register],
});

const notificationsSentTotal = new Counter({
	name: "notifications_sent_total",
	help: "Total release notification emails sent",
	registers: [register],
});

const scannerRunsTotal = new Counter({
	name: "scanner_runs_total",
	help: "Total number of scanner cron runs",
	registers: [register],
});

/**
 * Express middleware that records request count and duration.
 */
function metricsMiddleware(req, res, next) {
	const end = httpRequestDuration.startTimer();
	res.on("finish", () => {
		const route = req.route?.path || req.path;
		const labels = { method: req.method, route, status: res.statusCode };
		httpRequestsTotal.inc(labels);
		end(labels);
	});
	next();
}

export {
	confirmedSubscriptionsTotal,
	metricsMiddleware,
	notificationsSentTotal,
	register,
	scannerRunsTotal,
	subscriptionsTotal,
};
