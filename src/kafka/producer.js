import { logger } from "../services/logger.js";
import { getKafkaClient } from "./client.js";
import { TOPIC_EVENTS } from "./topics.js";

/**
 * Creates and manages a Kafka producer.
 *
 * The producer connects lazily on first publish and reconnects transparently.
 * If Kafka is unavailable the service degrades gracefully: publish() catches
 * the error, logs a warning, and returns without throwing — keeping the HTTP
 * path alive.
 *
 * @returns {{ publish: Function, connect: Function, disconnect: Function }}
 */
export function createProducer({ producer } = {}) {
	const kafkaProducer =
		producer ??
		getKafkaClient().producer({
			allowAutoTopicCreation: true,
		});

	let connected = false;

	/**
	 * Connects the producer to the Kafka broker.
	 * Safe to call multiple times.
	 */
	async function connect() {
		if (connected) return;
		await kafkaProducer.connect();
		connected = true;
		logger.info("[Kafka] Producer connected");
	}

	/**
	 * Disconnects the producer from the Kafka broker.
	 */
	async function disconnect() {
		if (!connected) return;
		await kafkaProducer.disconnect();
		connected = false;
		logger.info("[Kafka] Producer disconnected");
	}

	/**
	 * Publishes a typed event to the shared events topic.
	 *
	 * Has graceful degradation. The payload is JSON serialized.
	 *
	 * @param {import("./topics.js").EventTypeValue} type
	 * @param {object} payload
	 * @returns {Promise<void>}
	 */
	async function publish(type, payload) {
		const event = {
			type,
			payload,
			timestamp: new Date().toISOString(),
		};

		try {
			if (!connected) await connect();

			await kafkaProducer.send({
				topic: TOPIC_EVENTS,
				messages: [
					{
						key: payload.repo ?? payload.email ?? null,
						value: JSON.stringify(event),
					},
				],
			});

			logger.debug({ type, payload }, "[Kafka] Event published");
		} catch (err) {
			logger.warn({ err, type }, "[Kafka] Failed to publish event — skipping");
		}
	}

	return { publish, connect, disconnect };
}
