import { beforeEach, describe, expect, test, vi } from "vitest";

let eachMessageHandler = null; // set by consumer.run(), called by producer.send()

const mockConsumer = {
	connect: vi.fn().mockResolvedValue(undefined),
	disconnect: vi.fn().mockResolvedValue(undefined),
	subscribe: vi.fn().mockResolvedValue(undefined),
	run: vi.fn(async ({ eachMessage }) => {
		eachMessageHandler = eachMessage;
	}),
};

const mockProducer = {
	connect: vi.fn().mockResolvedValue(undefined),
	disconnect: vi.fn().mockResolvedValue(undefined),
	send: vi.fn(async ({ messages }) => {
		for (const msg of messages) {
			if (eachMessageHandler) {
				await eachMessageHandler({
					topic: "ghchk-events",
					partition: 0,
					message: { value: msg.value, key: msg.key ?? null },
				});
			}
		}
	}),
};

vi.mock("kafkajs", () => {
	class Kafka {
		producer() {
			return mockProducer;
		}
		consumer() {
			return mockConsumer;
		}
	}

	return {
		Kafka,
		logLevel: { WARN: 4, ERROR: 5 },
	};
});

vi.mock("node-cron", () => ({ schedule: vi.fn() }));

process.env.DB_PATH = ":memory:";
process.env.NODE_ENV = "test";
process.env.KAFKA_BROKERS = "localhost:9092";
process.env.KAFKA_CLIENT_ID = "ghchk-test";

const { createProducer } = await import("#src/kafka/producer.js");
const { createNotificationService } =
	await import("#src/services/notificationService.js");
const { createNotifier } = await import("#src/services/notifier.js");
const { EventType } = await import("#src/kafka/topics.js");

function makeTransport() {
	return { sendMail: vi.fn().mockResolvedValue(undefined) };
}

function releasePayload(overrides = {}) {
	return {
		email: "user@example.com",
		repo: "owner/repo",
		tag: "v2.0.0",
		unsubscribeToken: "tok-unsub",
		...overrides,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	eachMessageHandler = null;

	mockConsumer.connect.mockResolvedValue(undefined);
	mockConsumer.disconnect.mockResolvedValue(undefined);
	mockConsumer.subscribe.mockResolvedValue(undefined);
	mockConsumer.run.mockImplementation(async ({ eachMessage }) => {
		eachMessageHandler = eachMessage;
	});
	mockProducer.connect.mockResolvedValue(undefined);
	mockProducer.disconnect.mockResolvedValue(undefined);
	mockProducer.send.mockImplementation(async ({ messages }) => {
		for (const msg of messages) {
			if (eachMessageHandler) {
				await eachMessageHandler({
					topic: "ghchk-events",
					partition: 0,
					message: { value: msg.value, key: msg.key ?? null },
				});
			}
		}
	});
});

describe("Notification Service — consumer integration", () => {
	test("start() connects consumer and subscribes to ghchk-events", async () => {
		const notifier = createNotifier(makeTransport());
		const svc = createNotificationService({ notifier });

		await svc.start();

		expect(mockConsumer.connect).toHaveBeenCalledOnce();
		expect(mockConsumer.subscribe).toHaveBeenCalledWith(
			expect.objectContaining({ topic: "ghchk-events" })
		);
		expect(mockConsumer.run).toHaveBeenCalledOnce();

		await svc.stop();
	});

	test("stop() disconnects the consumer", async () => {
		const notifier = createNotifier(makeTransport());
		const svc = createNotificationService({ notifier });

		await svc.start();
		await svc.stop();

		expect(mockConsumer.disconnect).toHaveBeenCalledOnce();
	});

	test("producer.publish(release.detected) → sendReleaseNotification called", async () => {
		const transport = makeTransport();
		const notifier = createNotifier(transport);
		const svc = createNotificationService({ notifier });
		const producer = createProducer();

		await svc.start();
		await producer.connect();

		await producer.publish(EventType.RELEASE_DETECTED, releasePayload());

		expect(transport.sendMail).toHaveBeenCalledOnce();
		expect(transport.sendMail).toHaveBeenCalledWith(
			expect.objectContaining({
				to: "user@example.com",
			})
		);

		await svc.stop();
		await producer.disconnect();
	});

	test("release email contains the repo name and tag", async () => {
		const transport = makeTransport();
		const notifier = createNotifier(transport);
		const svc = createNotificationService({ notifier });
		const producer = createProducer();

		await svc.start();
		await producer.connect();

		await producer.publish(
			EventType.RELEASE_DETECTED,
			releasePayload({ repo: "facebook/react", tag: "v19.0.0" })
		);

		const call = transport.sendMail.mock.calls[0][0];
		const body = (call.html ?? "") + (call.text ?? "");
		expect(body).toMatch(/facebook\/react/);
		expect(body).toMatch(/v19\.0\.0/);

		await svc.stop();
		await producer.disconnect();
	});

	test("release email contains the unsubscribe link", async () => {
		const transport = makeTransport();
		const notifier = createNotifier(transport);
		const svc = createNotificationService({ notifier });
		const producer = createProducer();

		await svc.start();
		await producer.connect();

		await producer.publish(
			EventType.RELEASE_DETECTED,
			releasePayload({ unsubscribeToken: "my-unsub-token" })
		);

		const call = transport.sendMail.mock.calls[0][0];
		const body = (call.html ?? "") + (call.text ?? "");
		expect(body).toMatch(/my-unsub-token/);

		await svc.stop();
		await producer.disconnect();
	});

	test("multiple release.detected events each trigger a separate email", async () => {
		const transport = makeTransport();
		const notifier = createNotifier(transport);
		const svc = createNotificationService({ notifier });
		const producer = createProducer();

		await svc.start();
		await producer.connect();

		await producer.publish(
			EventType.RELEASE_DETECTED,
			releasePayload({ email: "a@example.com" })
		);
		await producer.publish(
			EventType.RELEASE_DETECTED,
			releasePayload({ email: "b@example.com" })
		);

		expect(transport.sendMail).toHaveBeenCalledTimes(2);
		const recipients = transport.sendMail.mock.calls.map((c) => c[0].to);
		expect(recipients).toContain("a@example.com");
		expect(recipients).toContain("b@example.com");

		await svc.stop();
		await producer.disconnect();
	});

	test("subscription.* events are silently ignored — no email sent", async () => {
		const transport = makeTransport();
		const notifier = createNotifier(transport);
		const svc = createNotificationService({ notifier });
		const producer = createProducer();

		await svc.start();
		await producer.connect();

		await producer.publish(EventType.SUBSCRIPTION_CREATED, {
			email: "a@example.com",
			repo: "x/y",
		});
		await producer.publish(EventType.SUBSCRIPTION_CONFIRMED, {
			email: "a@example.com",
			repo: "x/y",
		});
		await producer.publish(EventType.SUBSCRIPTION_DELETED, { token: "tok" });

		expect(transport.sendMail).not.toHaveBeenCalled();

		await svc.stop();
		await producer.disconnect();
	});

	test("SMTP failure does not crash the consumer — next message still processed", async () => {
		const transport = makeTransport();
		transport.sendMail
			.mockRejectedValueOnce(new Error("SMTP timeout"))
			.mockResolvedValueOnce(undefined);

		const notifier = createNotifier(transport);
		const svc = createNotificationService({ notifier });
		const producer = createProducer();

		await svc.start();
		await producer.connect();

		await producer.publish(
			EventType.RELEASE_DETECTED,
			releasePayload({ email: "fail@example.com" })
		);
		await producer.publish(
			EventType.RELEASE_DETECTED,
			releasePayload({ email: "ok@example.com" })
		);

		expect(transport.sendMail).toHaveBeenCalledTimes(2);

		await svc.stop();
		await producer.disconnect();
	});

	test("graceful degradation — Kafka unavailable does not throw from publish()", async () => {
		mockProducer.connect.mockRejectedValueOnce(new Error("broker down"));

		const producer = createProducer();

		await expect(
			producer.publish(EventType.RELEASE_DETECTED, releasePayload())
		).resolves.toBeUndefined();
	});
});
