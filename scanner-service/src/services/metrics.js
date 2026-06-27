import { createKafkaProducerMetrics } from "@ghchk/common/services/metrics.js";
import http from "http";
import { Counter, Registry } from "prom-client";

const METRICS_PORT = process.env.METRICS_PORT || 9464;
const registry = new Registry();

export const scannerRunsTotal = new Counter({
	name: "scanner_runs_total",
	help: "Total number of scanner cron runs",
	registers: [registry],
});

export const scannerErrorsTotal = new Counter({
	name: "scanner_errors_total",
	help: "Total number of errors during scanner cron runs",
	registers: [registry],
});

export const notificationsSentTotal = new Counter({
	name: "notifications_sent_total",
	help: "Total release notification emails sent",
	registers: [registry],
});

export const { kafkaProducerMessagesTotal, kafkaProducerErrorsTotal } =
	createKafkaProducerMetrics(registry);

export function startMetricsServer() {
	const server = http.createServer(async (req, res) => {
		if (req.url === "/metrics") {
			res.writeHead(200, { "Content-Type": registry.contentType });
			res.end(await registry.metrics());
		} else {
			res.writeHead(404);
			res.end();
		}
	});
	server.listen(METRICS_PORT, () =>
		console.info(`[Scanner] Metrics on :${METRICS_PORT}`)
	);
	return server;
}
