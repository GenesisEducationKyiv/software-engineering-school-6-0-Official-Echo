import { beforeEach, describe, expect, test, vi } from "vitest";

import { EventType } from "#src/kafka/topics.js";

vi.mock("#src/services/logger.js", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

let mockKafkaProducer;

vi.mock("kafkajs", () => {
	class Kafka {
		producer() {
			return mockKafkaProducer;
		}
	}

	return {
		Kafka,
		logLevel: { WARN: 4, ERROR: 5 },
	};
});

beforeEach(() => {
	vi.clearAllMocks();

	mockKafkaProducer = {
		connect: vi.fn().mockResolvedValue(undefined),
		disconnect: vi.fn().mockResolvedValue(undefined),
		send: vi.fn().mockResolvedValue(undefined),
	};
});

async function makeProducer() {
	vi.resetModules();
	const { createProducer } = await import("#src/kafka/producer.js");
	return createProducer();
}

describe("createProducer().publish()", () => {
	test("connects lazily on first publish", async () => {
		const producer = await makeProducer();

		await producer.publish(EventType.RELEASE_DETECTED, {
			email: "a@b.com",
			repo: "x/y",
			tag: "v1.0.0",
			unsubscribeToken: "tok",
		});

		expect(mockKafkaProducer.connect).toHaveBeenCalledOnce();
	});

	test("does not reconnect on second publish", async () => {
		const producer = await makeProducer();

		await producer.publish(EventType.SUBSCRIPTION_CREATED, {
			email: "a@b.com",
			repo: "x/y",
		});
		await producer.publish(EventType.SUBSCRIPTION_CONFIRMED, {
			email: "a@b.com",
			repo: "x/y",
		});

		expect(mockKafkaProducer.connect).toHaveBeenCalledOnce();
		expect(mockKafkaProducer.send).toHaveBeenCalledTimes(2);
	});

	test("sends message to the correct topic", async () => {
		const producer = await makeProducer();

		await producer.publish(EventType.RELEASE_DETECTED, {
			email: "a@b.com",
			repo: "x/y",
			tag: "v1.0.0",
			unsubscribeToken: "tok",
		});

		expect(mockKafkaProducer.send).toHaveBeenCalledWith(
			expect.objectContaining({ topic: "ghchk-events" })
		);
	});

	test("serializes the event payload as JSON with type + timestamp", async () => {
		const producer = await makeProducer();

		await producer.publish(EventType.RELEASE_DETECTED, {
			email: "a@b.com",
			repo: "x/y",
			tag: "v1.0.0",
			unsubscribeToken: "tok",
		});

		const [call] = mockKafkaProducer.send.mock.calls;
		const message = call[0].messages[0];
		const parsed = JSON.parse(message.value);

		expect(parsed.type).toBe(EventType.RELEASE_DETECTED);
		expect(parsed.payload).toMatchObject({
			email: "a@b.com",
			repo: "x/y",
			tag: "v1.0.0",
		});
		expect(parsed.timestamp).toBeDefined();
	});

	test("uses repo as Kafka message key when available", async () => {
		const producer = await makeProducer();

		await producer.publish(EventType.RELEASE_DETECTED, {
			email: "a@b.com",
			repo: "facebook/react",
			tag: "v18.0.0",
			unsubscribeToken: "tok",
		});

		const [call] = mockKafkaProducer.send.mock.calls;
		expect(call[0].messages[0].key).toBe("facebook/react");
	});

	test("uses email as Kafka message key when repo is absent", async () => {
		const producer = await makeProducer();

		await producer.publish(EventType.SUBSCRIPTION_DELETED, {
			email: "a@b.com",
			token: "unsub-tok",
		});

		const [call] = mockKafkaProducer.send.mock.calls;
		expect(call[0].messages[0].key).toBe("a@b.com");
	});

	test("resolves without throwing when send fails (graceful degradation)", async () => {
		mockKafkaProducer.send.mockRejectedValue(new Error("Broker unreachable"));
		const producer = await makeProducer();

		await expect(
			producer.publish(EventType.RELEASE_DETECTED, {
				email: "a@b.com",
				repo: "x/y",
				tag: "v1.0.0",
				unsubscribeToken: "tok",
			})
		).resolves.toBeUndefined();
	});

	test("resolves without throwing when connect fails (graceful degradation)", async () => {
		mockKafkaProducer.connect.mockRejectedValue(new Error("Connection refused"));
		const producer = await makeProducer();

		await expect(
			producer.publish(EventType.RELEASE_DETECTED, {
				email: "a@b.com",
				repo: "x/y",
				tag: "v1.0.0",
				unsubscribeToken: "tok",
			})
		).resolves.toBeUndefined();
	});
});

describe("createProducer().connect() / disconnect()", () => {
	test("connect() calls kafkajs producer.connect()", async () => {
		const producer = await makeProducer();
		await producer.connect();
		expect(mockKafkaProducer.connect).toHaveBeenCalledOnce();
	});

	test("connect() is idempotent — does not reconnect if already connected", async () => {
		const producer = await makeProducer();
		await producer.connect();
		await producer.connect();
		expect(mockKafkaProducer.connect).toHaveBeenCalledOnce();
	});

	test("disconnect() calls kafkajs producer.disconnect()", async () => {
		const producer = await makeProducer();
		await producer.connect();
		await producer.disconnect();
		expect(mockKafkaProducer.disconnect).toHaveBeenCalledOnce();
	});

	test("disconnect() is a no-op when not connected", async () => {
		const producer = await makeProducer();
		await producer.disconnect();
		expect(mockKafkaProducer.disconnect).not.toHaveBeenCalled();
	});
});
