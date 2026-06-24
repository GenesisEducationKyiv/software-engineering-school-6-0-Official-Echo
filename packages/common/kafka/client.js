import { Kafka, logLevel } from "kafkajs";

import { logger } from "../services/logger.js";

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || "localhost:9092").split(",");
const KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID || "ghchk";

/** @type {Kafka} */
let kafka;

/**
 * Returns the singleton Kafka client.
 * @returns {Kafka}
 */
export function getKafkaClient() {
	if (!kafka) {
		kafka = new Kafka({
			clientId: KAFKA_CLIENT_ID,
			brokers: KAFKA_BROKERS,
			logLevel: logLevel.WARN,
			logCreator: () => (entry) => {
				const { level, log } = entry;
				const { message, ...extra } = log;
				switch (level) {
					case logLevel.ERROR:
						logger.error(extra, `[Kafka] ${message}`);
						break;
					case logLevel.WARN:
						logger.warn(extra, `[Kafka] ${message}`);
						break;
					default:
						logger.debug(extra, `[Kafka] ${message}`);
				}
			},
		});
	}
	return kafka;
}
