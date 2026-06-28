import { beforeEach, describe, expect, test, vi } from "vitest";

import { EventType, TOPIC_EVENTS } from "#src/kafka/topics.js";
import {
	kafkaConsumerErrorsTotal,
	kafkaConsumerMessagesTotal,
	register,
} from "#src/services/metrics.js";
import { createNotificationService } from "#src/services/notificationService.js";

const { mockConsumer } = vi.hoisted(() => ({
	mockConsumer: {
		connect: vi.fn().mockResolvedValue(undefined),
		subscribe: vi.fn().mockResolvedValue(undefined),
		run: vi.fn().mockResolvedValue(undefined),
		disconnect: vi.fn().mockResolvedValue(undefined),
	},
}));

vi.mock("kafkajs", () => {
	class Kafka {
		consumer = vi.fn(() => mockConsumer);
	}

	return {
		Kafka,
		logLevel: { WARN: 4, ERROR: 5 },
	};
});

vi.mock("#src/services/logger.js", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

function makeService(overrides = {}) {
	const notifier = {
		sendReleaseNotification: vi.fn().mockResolvedValue(undefined),
		...overrides.notifier,
	};
	const service = createNotificationService({ notifier });
	return { service, handleEvent: service.handleEvent, notifier };
}

function labelsMatch(actual, expected) {
	return Object.entries(expected).every(
		([key, value]) => String(actual[key]) === String(value)
	);
}

async function counterValue(counter, labels) {
	const { values } = await counter.get();
	return values.find((v) => labelsMatch(v.labels, labels))?.value ?? 0;
}

/** Buffer-like Kafka message value, matching `message.value?.toString()`. */
function messageValue(obj) {
	return obj === undefined ? undefined : Buffer.from(JSON.stringify(obj));
}

beforeEach(() => {
	vi.clearAllMocks();
	register.resetMetrics();
});

describe("handleEvent — release.detected", () => {
	test("calls sendReleaseNotification with correct arguments", async () => {
		const { handleEvent, notifier } = makeService();

		await handleEvent({
			type: EventType.RELEASE_DETECTED,
			payload: {
				email: "user@example.com",
				repo: "facebook/react",
				tag: "v18.3.0",
				unsubscribeToken: "unsub-token-abc",
			},
			timestamp: new Date().toISOString(),
		});

		expect(notifier.sendReleaseNotification).toHaveBeenCalledOnce();
		expect(notifier.sendReleaseNotification).toHaveBeenCalledWith({
			to: "user@example.com",
			repo: "facebook/react",
			tag: "v18.3.0",
			unsubscribeToken: "unsub-token-abc",
		});
	});

	test("does NOT call sendReleaseNotification when email is missing", async () => {
		const { handleEvent, notifier } = makeService();

		await handleEvent({
			type: EventType.RELEASE_DETECTED,
			payload: {
				repo: "facebook/react",
				tag: "v18.3.0",
				unsubscribeToken: "unsub-token-abc",
			},
		});

		expect(notifier.sendReleaseNotification).not.toHaveBeenCalled();
	});

	test("does NOT call sendReleaseNotification when repo is missing", async () => {
		const { handleEvent, notifier } = makeService();

		await handleEvent({
			type: EventType.RELEASE_DETECTED,
			payload: {
				email: "user@example.com",
				tag: "v18.3.0",
				unsubscribeToken: "unsub-token-abc",
			},
		});

		expect(notifier.sendReleaseNotification).not.toHaveBeenCalled();
	});

	test("does NOT call sendReleaseNotification when tag is missing", async () => {
		const { handleEvent, notifier } = makeService();

		await handleEvent({
			type: EventType.RELEASE_DETECTED,
			payload: {
				email: "user@example.com",
				repo: "facebook/react",
				unsubscribeToken: "unsub-token-abc",
			},
		});

		expect(notifier.sendReleaseNotification).not.toHaveBeenCalled();
	});

	test("does NOT call sendReleaseNotification when unsubscribeToken is missing", async () => {
		const { handleEvent, notifier } = makeService();

		await handleEvent({
			type: EventType.RELEASE_DETECTED,
			payload: {
				email: "user@example.com",
				repo: "facebook/react",
				tag: "v18.3.0",
			},
		});

		expect(notifier.sendReleaseNotification).not.toHaveBeenCalled();
	});

	test("does NOT call sendReleaseNotification when payload is null", async () => {
		const { handleEvent, notifier } = makeService();

		await handleEvent({
			type: EventType.RELEASE_DETECTED,
			payload: null,
		});

		expect(notifier.sendReleaseNotification).not.toHaveBeenCalled();
	});

	test("propagates errors from sendReleaseNotification (caller handles them)", async () => {
		const smtpError = new Error("SMTP connection refused");
		const { handleEvent } = makeService({
			notifier: {
				sendReleaseNotification: vi.fn().mockRejectedValue(smtpError),
			},
		});

		await expect(
			handleEvent({
				type: EventType.RELEASE_DETECTED,
				payload: {
					email: "user@example.com",
					repo: "facebook/react",
					tag: "v18.3.0",
					unsubscribeToken: "tok",
				},
			})
		).rejects.toThrow("SMTP connection refused");
	});
});

describe("handleEvent — subscription lifecycle events (no-ops)", () => {
	test.each([
		EventType.SUBSCRIPTION_CREATED,
		EventType.SUBSCRIPTION_CONFIRMED,
		EventType.SUBSCRIPTION_DELETED,
	])("does not call sendReleaseNotification for %s event", async (type) => {
		const { handleEvent, notifier } = makeService();

		await handleEvent({
			type,
			payload: { email: "user@example.com", repo: "owner/repo" },
			timestamp: new Date().toISOString(),
		});

		expect(notifier.sendReleaseNotification).not.toHaveBeenCalled();
	});

	test("resolves without error for subscription.created", async () => {
		const { handleEvent } = makeService();
		await expect(
			handleEvent({
				type: EventType.SUBSCRIPTION_CREATED,
				payload: { email: "a@b.com", repo: "x/y" },
			})
		).resolves.toBeUndefined();
	});
});

describe("handleEvent — unknown or malformed events", () => {
	test("does not call sendReleaseNotification for unknown event type", async () => {
		const { handleEvent, notifier } = makeService();

		await handleEvent({
			type: "some.unknown.event",
			payload: { anything: true },
		});

		expect(notifier.sendReleaseNotification).not.toHaveBeenCalled();
	});

	test("resolves without error for unknown event type", async () => {
		const { handleEvent } = makeService();
		await expect(
			handleEvent({ type: "future.event.type", payload: {} })
		).resolves.toBeUndefined();
	});

	test("handles null event gracefully", async () => {
		const { handleEvent, notifier } = makeService();
		await expect(handleEvent(null)).resolves.toBeUndefined();
		expect(notifier.sendReleaseNotification).not.toHaveBeenCalled();
	});

	test("handles non-object event gracefully", async () => {
		const { handleEvent, notifier } = makeService();
		await expect(handleEvent("bad string")).resolves.toBeUndefined();
		expect(notifier.sendReleaseNotification).not.toHaveBeenCalled();
	});

	test("handles event with no type gracefully", async () => {
		const { handleEvent, notifier } = makeService();
		await expect(
			handleEvent({ payload: { email: "a@b.com" } })
		).resolves.toBeUndefined();
		expect(notifier.sendReleaseNotification).not.toHaveBeenCalled();
	});
});

describe("handleEvent — multiple calls", () => {
	test("sends one notification per release.detected event", async () => {
		const { handleEvent, notifier } = makeService();

		const event = {
			type: EventType.RELEASE_DETECTED,
			payload: {
				email: "user@example.com",
				repo: "facebook/react",
				tag: "v18.3.0",
				unsubscribeToken: "tok",
			},
		};

		await handleEvent(event);
		await handleEvent(event);

		expect(notifier.sendReleaseNotification).toHaveBeenCalledTimes(2);
	});

	test("correctly routes different event types in sequence", async () => {
		const { handleEvent, notifier } = makeService();

		await handleEvent({
			type: EventType.SUBSCRIPTION_CREATED,
			payload: { email: "a@b.com", repo: "x/y" },
		});
		await handleEvent({
			type: EventType.RELEASE_DETECTED,
			payload: {
				email: "a@b.com",
				repo: "x/y",
				tag: "v1.0.0",
				unsubscribeToken: "tok",
			},
		});
		await handleEvent({
			type: EventType.SUBSCRIPTION_DELETED,
			payload: { token: "unsub-tok" },
		});

		expect(notifier.sendReleaseNotification).toHaveBeenCalledOnce();
	});
});

describe("start()", () => {
	test("connects, subscribes to the shared topic, and starts the consumer", async () => {
		const { service } = makeService();
		await service.start();

		expect(mockConsumer.connect).toHaveBeenCalledOnce();
		expect(mockConsumer.subscribe).toHaveBeenCalledWith({
			topic: TOPIC_EVENTS,
			fromBeginning: false,
		});
		expect(mockConsumer.run).toHaveBeenCalledOnce();
	});
});

describe("stop()", () => {
	test("disconnects the consumer", async () => {
		const { service } = makeService();
		await service.start();
		await service.stop();

		expect(mockConsumer.disconnect).toHaveBeenCalledOnce();
	});
});

describe("eachMessage handler (registered via start())", () => {
	async function getEachMessage(overrides) {
		const { service, notifier } = makeService(overrides);
		await service.start();
		const { eachMessage } = mockConsumer.run.mock.calls[0][0];
		return { service, notifier, eachMessage };
	}

	test("skips an empty message without parsing or calling handleEvent", async () => {
		const { notifier, eachMessage } = await getEachMessage();

		await eachMessage({
			topic: TOPIC_EVENTS,
			partition: 0,
			message: { value: messageValue(undefined) },
		});

		expect(notifier.sendReleaseNotification).not.toHaveBeenCalled();
		expect(
			await counterValue(kafkaConsumerMessagesTotal, { topic: TOPIC_EVENTS })
		).toBe(0);
	});

	test("parses a valid message and dispatches it to handleEvent", async () => {
		const { notifier, eachMessage } = await getEachMessage();

		await eachMessage({
			topic: TOPIC_EVENTS,
			partition: 0,
			message: {
				value: messageValue({
					type: EventType.RELEASE_DETECTED,
					payload: {
						email: "a@b.com",
						repo: "x/y",
						tag: "v1.0.0",
						unsubscribeToken: "tok",
					},
				}),
			},
		});

		expect(notifier.sendReleaseNotification).toHaveBeenCalledOnce();
		expect(
			await counterValue(kafkaConsumerMessagesTotal, {
				topic: TOPIC_EVENTS,
				event_type: EventType.RELEASE_DETECTED,
			})
		).toBe(1);
	});

	test("counts messages with no `type` field as event_type unknown", async () => {
		const { eachMessage } = await getEachMessage();

		await eachMessage({
			topic: TOPIC_EVENTS,
			partition: 0,
			message: { value: messageValue({ payload: {} }) },
		});

		expect(
			await counterValue(kafkaConsumerMessagesTotal, {
				topic: TOPIC_EVENTS,
				event_type: "unknown",
			})
		).toBe(1);
	});

	test("logs and increments error metrics on invalid JSON, without throwing", async () => {
		const { eachMessage } = await getEachMessage();

		await expect(
			eachMessage({
				topic: TOPIC_EVENTS,
				partition: 0,
				message: { value: Buffer.from("not-json{") },
			})
		).resolves.toBeUndefined();

		expect(
			await counterValue(kafkaConsumerErrorsTotal, {
				topic: TOPIC_EVENTS,
				event_type: "unknown",
			})
		).toBe(1);

		expect(
			await counterValue(kafkaConsumerMessagesTotal, { topic: TOPIC_EVENTS })
		).toBe(0);
	});

	test("catches errors thrown by handleEvent, increments error metrics, and resumes", async () => {
		const { eachMessage } = await getEachMessage({
			notifier: {
				sendReleaseNotification: vi
					.fn()
					.mockRejectedValue(new Error("SMTP down")),
			},
		});

		await expect(
			eachMessage({
				topic: TOPIC_EVENTS,
				partition: 0,
				message: {
					value: messageValue({
						type: EventType.RELEASE_DETECTED,
						payload: {
							email: "a@b.com",
							repo: "x/y",
							tag: "v1.0.0",
							unsubscribeToken: "tok",
						},
					}),
				},
			})
		).resolves.toBeUndefined();

		expect(
			await counterValue(kafkaConsumerErrorsTotal, {
				topic: TOPIC_EVENTS,
				event_type: EventType.RELEASE_DETECTED,
			})
		).toBe(1);
	});

	test("ignores messages once the consumer has been stopped", async () => {
		const { service, notifier, eachMessage } = await getEachMessage();
		await service.stop();

		await eachMessage({
			topic: TOPIC_EVENTS,
			partition: 0,
			message: {
				value: messageValue({
					type: EventType.RELEASE_DETECTED,
					payload: {
						email: "a@b.com",
						repo: "x/y",
						tag: "v1.0.0",
						unsubscribeToken: "tok",
					},
				}),
			},
		});

		expect(notifier.sendReleaseNotification).not.toHaveBeenCalled();
	});
});
