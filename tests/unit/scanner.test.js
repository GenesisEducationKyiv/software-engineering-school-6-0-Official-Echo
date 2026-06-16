import { beforeEach, describe, expect, test, vi } from "vitest";

import { RateLimitError } from "#src/errors/index.js";
import { EventType } from "#src/kafka/topics.js";
import { createScanner } from "#src/services/scanner.js";

vi.mock("#src/services/logger.js", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

vi.mock("node-cron", () => ({ schedule: vi.fn() }));

function makeScanner(overrides = {}) {
	const githubService = {
		getLatestRelease: vi.fn(),
		...overrides.githubService,
	};
	const notifier = overrides.notifier
		? { sendReleaseNotification: vi.fn(), ...overrides.notifier }
		: undefined;

	const producer = overrides.producer ?? {
		publish: vi.fn().mockResolvedValue(undefined),
	};

	const repository = {
		findConfirmedRepos: vi.fn().mockResolvedValue([]),
		findConfirmedSubscribersByRepo: vi.fn().mockResolvedValue([]),
		updateLastSeenTag: vi.fn().mockResolvedValue(undefined),
		...overrides.repository,
	};
	const metrics = {
		scannerRunsTotal: { inc: vi.fn() },
		scannerErrorsTotal: { inc: vi.fn() },
		notificationsSentTotal: { inc: vi.fn() },
		...overrides.metrics,
	};

	const scanner = createScanner({
		githubService,
		notifier,
		producer,
		repository,
		metrics,
	});
	return { scanner, githubService, notifier, producer, repository, metrics };
}

beforeEach(() => vi.clearAllMocks());

describe("checkRepo — Kafka producer path", () => {
	test("does nothing when no releases exist", async () => {
		const { scanner, producer } = makeScanner({
			githubService: { getLatestRelease: vi.fn().mockResolvedValue(null) },
		});

		await scanner.checkRepo("some/repo");

		expect(producer.publish).not.toHaveBeenCalled();
	});

	test("stores tag on first check (last_seen_tag = null), does NOT publish", async () => {
		const subscribers = [
			{
				id: 1,
				email: "a@test.com",
				unsubscribe_token: "tokA",
				last_seen_tag: null,
			},
		];
		const { scanner, producer, repository } = makeScanner({
			githubService: { getLatestRelease: vi.fn().mockResolvedValue("v1.0.0") },
			repository: {
				findConfirmedSubscribersByRepo: vi
					.fn()
					.mockResolvedValue(subscribers),
			},
		});

		await scanner.checkRepo("first/check");

		expect(producer.publish).not.toHaveBeenCalled();
		expect(repository.updateLastSeenTag).toHaveBeenCalledWith(1, "v1.0.0");
	});

	test("does not publish when tag is unchanged", async () => {
		const subscribers = [
			{
				id: 1,
				email: "a@test.com",
				unsubscribe_token: "tokA",
				last_seen_tag: "v1.0.0",
			},
		];
		const { scanner, producer } = makeScanner({
			githubService: { getLatestRelease: vi.fn().mockResolvedValue("v1.0.0") },
			repository: {
				findConfirmedSubscribersByRepo: vi
					.fn()
					.mockResolvedValue(subscribers),
			},
		});

		await scanner.checkRepo("same/tag");

		expect(producer.publish).not.toHaveBeenCalled();
	});

	test("publishes release.detected event for each subscriber when new release found", async () => {
		const subscribers = [
			{
				id: 1,
				email: "a@test.com",
				unsubscribe_token: "tokA",
				last_seen_tag: "v1.0.0",
			},
			{
				id: 2,
				email: "b@test.com",
				unsubscribe_token: "tokB",
				last_seen_tag: "v1.0.0",
			},
		];
		const { scanner, producer, repository } = makeScanner({
			githubService: { getLatestRelease: vi.fn().mockResolvedValue("v2.0.0") },
			repository: {
				findConfirmedSubscribersByRepo: vi
					.fn()
					.mockResolvedValue(subscribers),
			},
		});

		await scanner.checkRepo("new/release");

		expect(producer.publish).toHaveBeenCalledTimes(2);
		expect(producer.publish).toHaveBeenCalledWith(EventType.RELEASE_DETECTED, {
			email: "a@test.com",
			repo: "new/release",
			tag: "v2.0.0",
			unsubscribeToken: "tokA",
		});
		expect(producer.publish).toHaveBeenCalledWith(EventType.RELEASE_DETECTED, {
			email: "b@test.com",
			repo: "new/release",
			tag: "v2.0.0",
			unsubscribeToken: "tokB",
		});
		expect(repository.updateLastSeenTag).toHaveBeenCalledWith(1, "v2.0.0");
		expect(repository.updateLastSeenTag).toHaveBeenCalledWith(2, "v2.0.0");
	});

	test("increments notificationsSentTotal for each published event", async () => {
		const subscribers = [
			{
				id: 1,
				email: "a@test.com",
				unsubscribe_token: "tokA",
				last_seen_tag: "v1.0.0",
			},
		];
		const { scanner, metrics } = makeScanner({
			githubService: { getLatestRelease: vi.fn().mockResolvedValue("v2.0.0") },
			repository: {
				findConfirmedSubscribersByRepo: vi
					.fn()
					.mockResolvedValue(subscribers),
			},
		});

		await scanner.checkRepo("counter/repo");

		expect(metrics.notificationsSentTotal.inc).toHaveBeenCalledTimes(1);
	});

	test("continues publishing to remaining subscribers even if producer.publish fails for one", async () => {
		const subscribers = [
			{
				id: 1,
				email: "a@test.com",
				unsubscribe_token: "tokA",
				last_seen_tag: "v1.0.0",
			},
			{
				id: 2,
				email: "b@test.com",
				unsubscribe_token: "tokB",
				last_seen_tag: "v1.0.0",
			},
		];
		const silentFailPublish = vi.fn().mockResolvedValue(undefined);

		const { scanner } = makeScanner({
			githubService: { getLatestRelease: vi.fn().mockResolvedValue("v2.0.0") },
			producer: { publish: silentFailPublish },
			repository: {
				findConfirmedSubscribersByRepo: vi
					.fn()
					.mockResolvedValue(subscribers),
			},
		});

		await expect(scanner.checkRepo("resilient/repo")).resolves.toBeUndefined();
		expect(silentFailPublish).toHaveBeenCalledTimes(2);
	});
});

describe("checkRepo — direct notifier fallback (no producer)", () => {
	function makeScannerNoProducer(overrides = {}) {
		const githubService = {
			getLatestRelease: vi.fn(),
			...overrides.githubService,
		};
		const notifier = {
			sendReleaseNotification: vi.fn().mockResolvedValue(undefined),
			...overrides.notifier,
		};
		const repository = {
			findConfirmedRepos: vi.fn().mockResolvedValue([]),
			findConfirmedSubscribersByRepo: vi.fn().mockResolvedValue([]),
			updateLastSeenTag: vi.fn().mockResolvedValue(undefined),
			...overrides.repository,
		};
		const metrics = {
			scannerRunsTotal: { inc: vi.fn() },
			scannerErrorsTotal: { inc: vi.fn() },
			notificationsSentTotal: { inc: vi.fn() },
		};
		const scanner = createScanner({
			githubService,
			notifier,
			producer: undefined,
			repository,
			metrics,
		});
		return { scanner, notifier, repository, metrics };
	}

	test("calls sendReleaseNotification directly when no producer is provided", async () => {
		const subscribers = [
			{
				id: 1,
				email: "a@test.com",
				unsubscribe_token: "tokA",
				last_seen_tag: "v1.0.0",
			},
		];
		const { scanner, notifier } = makeScannerNoProducer({
			githubService: { getLatestRelease: vi.fn().mockResolvedValue("v2.0.0") },
			repository: {
				findConfirmedSubscribersByRepo: vi
					.fn()
					.mockResolvedValue(subscribers),
			},
		});

		await scanner.checkRepo("direct/repo");

		expect(notifier.sendReleaseNotification).toHaveBeenCalledOnce();
		expect(notifier.sendReleaseNotification).toHaveBeenCalledWith({
			to: "a@test.com",
			repo: "direct/repo",
			tag: "v2.0.0",
			unsubscribeToken: "tokA",
		});
	});

	test("continues to next subscriber if email fails in fallback mode", async () => {
		const subscribers = [
			{
				id: 1,
				email: "a@test.com",
				unsubscribe_token: "tokA",
				last_seen_tag: "v1.0.0",
			},
			{
				id: 2,
				email: "b@test.com",
				unsubscribe_token: "tokB",
				last_seen_tag: "v1.0.0",
			},
		];
		const { scanner, notifier } = makeScannerNoProducer({
			githubService: { getLatestRelease: vi.fn().mockResolvedValue("v2.0.0") },
			notifier: {
				sendReleaseNotification: vi
					.fn()
					.mockRejectedValueOnce(new Error("SMTP error"))
					.mockResolvedValueOnce(undefined),
			},
			repository: {
				findConfirmedSubscribersByRepo: vi
					.fn()
					.mockResolvedValue(subscribers),
			},
		});

		await scanner.checkRepo("fallback/resilient");

		expect(notifier.sendReleaseNotification).toHaveBeenCalledTimes(2);
	});
});

describe("scanAllRepos", () => {
	test("increments scanner run counter", async () => {
		const { scanner, metrics } = makeScanner({
			repository: { findConfirmedRepos: vi.fn().mockResolvedValue([]) },
		});

		await scanner.scanAllRepos();

		expect(metrics.scannerRunsTotal.inc).toHaveBeenCalled();
	});

	test("does nothing when no confirmed repos exist", async () => {
		const { scanner, producer } = makeScanner({
			repository: { findConfirmedRepos: vi.fn().mockResolvedValue([]) },
		});

		await scanner.scanAllRepos();

		expect(producer.publish).not.toHaveBeenCalled();
	});

	test("stops on RateLimitError and skips remaining repos", async () => {
		const getLatestRelease = vi
			.fn()
			.mockResolvedValueOnce(null)
			.mockRejectedValueOnce(
				new RateLimitError("rate limited", "RATE_LIMITED", 30)
			)
			.mockResolvedValueOnce(null);

		const { scanner } = makeScanner({
			githubService: { getLatestRelease },
			repository: {
				findConfirmedRepos: vi
					.fn()
					.mockResolvedValue([
						{ repo: "a/one" },
						{ repo: "b/two" },
						{ repo: "c/three" },
					]),
				findConfirmedSubscribersByRepo: vi.fn().mockResolvedValue([]),
			},
		});

		await scanner.scanAllRepos();

		expect(getLatestRelease).toHaveBeenCalledTimes(2);
	});

	test("continues after a non-rate-limit error", async () => {
		const getLatestRelease = vi
			.fn()
			.mockRejectedValueOnce(new Error("network error"))
			.mockResolvedValueOnce(null);

		const { scanner } = makeScanner({
			githubService: { getLatestRelease },
			repository: {
				findConfirmedRepos: vi
					.fn()
					.mockResolvedValue([{ repo: "a/one" }, { repo: "b/two" }]),
				findConfirmedSubscribersByRepo: vi.fn().mockResolvedValue([]),
			},
		});

		await scanner.scanAllRepos();

		expect(getLatestRelease).toHaveBeenCalledTimes(2);
	});

	test("increments scannerErrorsTotal on unexpected error", async () => {
		const { scanner, metrics } = makeScanner({
			githubService: {
				getLatestRelease: vi.fn().mockRejectedValue(new Error("oops")),
			},
			repository: {
				findConfirmedRepos: vi.fn().mockResolvedValue([{ repo: "a/b" }]),
				findConfirmedSubscribersByRepo: vi.fn().mockResolvedValue([]),
			},
		});

		await scanner.scanAllRepos();

		expect(metrics.scannerErrorsTotal.inc).toHaveBeenCalledTimes(1);
	});
});
