import { getKafkaClient } from "../kafka/client.js";
import { ConsumerGroup, EventType, TOPIC_EVENTS } from "../kafka/topics.js";
import { logger } from "./logger.js";

/**
 * Creates the Notification Service consumer.
 *
 * This service subscribes to the shared `ghchk-events` Kafka topic and reacts
 * to `release.detected` events by sending release notification emails to the
 * subscriber identified in the event payload.
 *
 * Other event types are acknowledged but ignored for offset management.
 *
 * @param {{ notifier: { sendReleaseNotification: Function } }} deps
 * @returns {{ start: Function, stop: Function }}
 */
export function createNotificationService({ notifier }) {
	const consumer = getKafkaClient().consumer({
		groupId: ConsumerGroup.NOTIFICATION_SERVICE,
	});

	let running = false;

	/**
	 * Handles a single deserialized Kafka event.
	 *
	 * @param {{ type: string, payload: object, timestamp: string }} event
	 */
	async function handleEvent(event) {
		if (!event || typeof event !== "object") {
			logger.warn({ event }, "[NotificationService] Received malformed event");
			return;
		}

		const { type, payload } = event;

		switch (type) {
			case EventType.RELEASE_DETECTED: {
				const { email, repo, tag, unsubscribeToken } = payload ?? {};

				if (!email || !repo || !tag || !unsubscribeToken) {
					logger.warn(
						{ payload },
						"[NotificationService] release.detected event missing required fields"
					);
					return;
				}

				logger.info(
					{ email, repo, tag },
					"[NotificationService] Sending release notification"
				);

				await notifier.sendReleaseNotification({
					to: email,
					repo,
					tag,
					unsubscribeToken,
				});

				logger.info(
					{ email, repo, tag },
					"[NotificationService] Release notification sent"
				);
				break;
			}

			case EventType.SUBSCRIPTION_CREATED:
			case EventType.SUBSCRIPTION_CONFIRMED:
			case EventType.SUBSCRIPTION_DELETED:
				// Acknowledged but not handled by this consumer.
				logger.debug(
					{ type },
					"[NotificationService] Skipping non-notification event"
				);
				break;

			default:
				logger.warn(
					{ type },
					"[NotificationService] Unknown event type — skipping"
				);
		}
	}

	/**
	 * Connects to Kafka and starts consuming events.
	 */
	async function start() {
		await consumer.connect();
		await consumer.subscribe({ topic: TOPIC_EVENTS, fromBeginning: false });

		running = true;
		logger.info(
			{ topic: TOPIC_EVENTS, group: ConsumerGroup.NOTIFICATION_SERVICE },
			"[NotificationService] Consumer started"
		);

		await consumer.run({
			eachMessage: async ({ topic, partition, message }) => {
				if (!running) return;

				const raw = message.value?.toString();
				if (!raw) {
					logger.warn(
						{ topic, partition },
						"[NotificationService] Received empty message — skipping"
					);
					return;
				}

				let event;
				try {
					event = JSON.parse(raw);
				} catch (parseErr) {
					logger.error(
						{ parseErr, raw },
						"[NotificationService] Failed to parse message as JSON — skipping"
					);
					return;
				}

				try {
					await handleEvent(event);
				} catch (err) {
					// skip to resume consumer
					logger.error(
						{ err, event },
						"[NotificationService] Error handling event — message skipped"
					);
				}
			},
		});
	}

	/**
	 * Stops the consumer.
	 */
	async function stop() {
		running = false;
		await consumer.disconnect();
		logger.info("[NotificationService] Consumer stopped");
	}

	return { start, stop, handleEvent };
}
