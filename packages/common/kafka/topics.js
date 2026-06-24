/**
 * Application Kafka topic.
 */
export const TOPIC_EVENTS = "ghchk-events";

/**
 * Event type constants published to TOPIC_EVENTS.
 */
export const EventType = Object.freeze({
	SUBSCRIPTION_CREATED: "subscription.created",
	SUBSCRIPTION_CONFIRMED: "subscription.confirmed",
	SUBSCRIPTION_DELETED: "subscription.deleted",
	RELEASE_DETECTED: "release.detected",
});

/**
 * @typedef {typeof EventType[keyof typeof EventType]} EventTypeValue
 */

/**
 * Consumer group IDs.
 */
export const ConsumerGroup = Object.freeze({
	NOTIFICATION_SERVICE: "ghchk-notification-service",
	SCANNER_SERVICE: "ghchk-scanner-service",
});
