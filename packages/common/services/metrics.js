import { Counter } from "prom-client";

/**
 * Creates the Kafka producer metrics shared by every service that publishes
 * to the `ghchk-events` topic (currently the main API and scanner-service).
 *
 * Each service keeps its own `Registry`/process/`/metrics` endpoint — this
 * only guarantees the metric *name, help text, and label set* stay
 * identical across services, so a Grafana panel doesn't care which job
 * produced a given series.
 *
 * @param {import("prom-client").Registry} register
 * @returns {{
 *   kafkaProducerMessagesTotal: import("prom-client").Counter,
 *   kafkaProducerErrorsTotal: import("prom-client").Counter,
 * }}
 */
export function createKafkaProducerMetrics(register) {
	return {
		kafkaProducerMessagesTotal: new Counter({
			name: "kafka_producer_messages_total",
			help: "Total number of messages successfully published to Kafka",
			labelNames: ["topic", "event_type"],
			registers: [register],
		}),
		kafkaProducerErrorsTotal: new Counter({
			name: "kafka_producer_errors_total",
			help: "Total number of Kafka producer publish failures",
			labelNames: ["topic", "event_type"],
			registers: [register],
		}),
	};
}
