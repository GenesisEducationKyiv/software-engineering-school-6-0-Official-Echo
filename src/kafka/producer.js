import { createProducer as createBaseProducer } from "@ghchk/common/kafka/producer.js";

import {
	kafkaProducerErrorsTotal,
	kafkaProducerMessagesTotal,
} from "../services/metrics.js";
import { TOPIC_EVENTS } from "./topics.js";

/**
 * Wraps the shared Kafka producer with
 * this service's Prometheus counters.
 *
 * @param {{ producer?: import("kafkajs").Producer }} [options]
 * @returns {{ publish: Function, connect: Function, disconnect: Function }}
 */
export function createProducer(options = {}) {
	return createBaseProducer({
		...options,
		onPublished: (type) =>
			kafkaProducerMessagesTotal.inc({
				topic: TOPIC_EVENTS,
				event_type: type,
			}),
		onPublishError: (type) =>
			kafkaProducerErrorsTotal.inc({ topic: TOPIC_EVENTS, event_type: type }),
	});
}
