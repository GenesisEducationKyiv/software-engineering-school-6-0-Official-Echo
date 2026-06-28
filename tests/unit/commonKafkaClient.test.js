import { beforeEach, describe, expect, test, vi } from "vitest";

const mockLogger = { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() };

const logLevel = { ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 };

vi.mock("@ghchk/common/services/logger.js", () => ({ logger: mockLogger }));

vi.mock("kafkajs", () => {
	const Kafka = vi.fn(function (config) {
		this.config = config;
	});
	return { Kafka, logLevel };
});

describe("getKafkaClient", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		vi.unstubAllEnvs();
	});

	test("returns a Kafka client configured with default broker/clientId", async () => {
		const { getKafkaClient } = await import("@ghchk/common/kafka/client.js");
		const client = getKafkaClient();

		expect(client.config.clientId).toBe("ghchk");
		expect(client.config.brokers).toEqual(["localhost:9092"]);
	});

	test("reads KAFKA_BROKERS (comma-separated) and KAFKA_CLIENT_ID from env", async () => {
		vi.stubEnv("KAFKA_BROKERS", "broker-a:9092,broker-b:9092");
		vi.stubEnv("KAFKA_CLIENT_ID", "ghchk-scanner");

		const { getKafkaClient } = await import("@ghchk/common/kafka/client.js");
		const client = getKafkaClient();

		expect(client.config.brokers).toEqual(["broker-a:9092", "broker-b:9092"]);
		expect(client.config.clientId).toBe("ghchk-scanner");
	});

	test("returns the same singleton instance on repeated calls", async () => {
		const { getKafkaClient } = await import("@ghchk/common/kafka/client.js");
		expect(getKafkaClient()).toBe(getKafkaClient());
	});

	test("only constructs the Kafka client once", async () => {
		const { Kafka } = await import("kafkajs");
		const { getKafkaClient } = await import("@ghchk/common/kafka/client.js");
		getKafkaClient();
		getKafkaClient();
		expect(Kafka).toHaveBeenCalledTimes(1);
	});

	describe("logCreator", () => {
		async function getLogFn() {
			const { getKafkaClient } = await import("@ghchk/common/kafka/client.js");
			const { logCreator } = getKafkaClient().config;
			return logCreator();
		}

		test("routes ERROR-level entries to logger.error", async () => {
			const logFn = await getLogFn();
			logFn({ level: logLevel.ERROR, log: { message: "boom", extra: 1 } });

			expect(mockLogger.error).toHaveBeenCalledWith(
				{ extra: 1 },
				"[Kafka] boom"
			);
		});

		test("routes WARN-level entries to logger.warn", async () => {
			const logFn = await getLogFn();
			logFn({ level: logLevel.WARN, log: { message: "careful", extra: 2 } });

			expect(mockLogger.warn).toHaveBeenCalledWith(
				{ extra: 2 },
				"[Kafka] careful"
			);
		});

		test("routes everything else (INFO/DEBUG) to logger.debug", async () => {
			const logFn = await getLogFn();
			logFn({ level: logLevel.INFO, log: { message: "fyi", extra: 3 } });
			logFn({ level: logLevel.DEBUG, log: { message: "trace", extra: 4 } });

			expect(mockLogger.debug).toHaveBeenCalledWith(
				{ extra: 3 },
				"[Kafka] fyi"
			);
			expect(mockLogger.debug).toHaveBeenCalledWith(
				{ extra: 4 },
				"[Kafka] trace"
			);
		});

		test("strips the message key out of the extra fields object", async () => {
			const logFn = await getLogFn();
			logFn({ level: logLevel.ERROR, log: { message: "boom", broker: "b1" } });

			const [extra] = mockLogger.error.mock.calls[0];
			expect(extra).not.toHaveProperty("message");
			expect(extra).toEqual({ broker: "b1" });
		});
	});
});
