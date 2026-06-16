import { beforeEach, describe, expect, test, vi } from "vitest";

import { EventType } from "#src/kafka/topics.js";
import { createNotificationService } from "#src/services/notificationService.js";

vi.mock("kafkajs", () => {
	const consumer = {
		connect: vi.fn().mockResolvedValue(undefined),
		subscribe: vi.fn().mockResolvedValue(undefined),
		run: vi.fn().mockResolvedValue(undefined),
		disconnect: vi.fn().mockResolvedValue(undefined),
	};

	class Kafka {
		consumer = vi.fn(() => consumer);
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
	const { handleEvent } = createNotificationService({ notifier });
	return { handleEvent, notifier };
}

beforeEach(() => vi.clearAllMocks());

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
