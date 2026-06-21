import { logger } from "../services/logger.js";
import { getKafkaClient } from "./client.js";
import { TOPIC_EVENTS } from "./topics.js";

export function createProducer({ producer } = {}) {
	const kafkaProducer =
		producer ?? getKafkaClient().producer({ allowAutoTopicCreation: true });

	let connected = false;

	async function connect() {
		if (connected) return;
		await kafkaProducer.connect();
		connected = true;
		logger.info("[Kafka] Producer connected");
	}

	async function disconnect() {
		if (!connected) return;
		await kafkaProducer.disconnect();
		connected = false;
		logger.info("[Kafka] Producer disconnected");
	}

	async function publish(type, payload) {
		const event = { type, payload, timestamp: new Date().toISOString() };
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
