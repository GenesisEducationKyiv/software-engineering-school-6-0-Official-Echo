import http from "http";
import { Counter, Registry } from "prom-client";

const METRICS_PORT = process.env.METRICS_PORT || 9464;
const registry = new Registry();

export const scannerRunsTotal = new Counter({
	name: "ghchk_scanner_runs_total",
	help: "Number of scanner cron cycles completed",
	registers: [registry],
});

export const scannerErrorsTotal = new Counter({
	name: "ghchk_scanner_errors_total",
	help: "Number of per-repo errors during scanning",
	registers: [registry],
});

export const notificationsSentTotal = new Counter({
	name: "ghchk_notifications_sent_total",
	help: "Number of release.detected events published",
	registers: [registry],
});

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
