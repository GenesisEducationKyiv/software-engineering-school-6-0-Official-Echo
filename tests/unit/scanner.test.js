import { beforeEach, describe, expect, test, vi } from "vitest";

import { RateLimitError } from "#src/errors/index.js";
import { createScanner } from "#src/services/scanner.js";

// scanner.js no longer imports concrete modules — all deps are injected.
// No vi.mock() needed: we just pass plain vi.fn() objects directly.

function makeScanner(overrides = {}) {
	const githubService = {
		getLatestRelease: vi.fn(),
		...overrides.githubService,
	};
	const notifier = {
		sendReleaseNotification: vi.fn(),
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
		...overrides.metrics,
	};

	const scanner = createScanner({ githubService, notifier, repository, metrics });
	return { scanner, githubService, notifier, repository, metrics };
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("checkRepo", () => {
	test("does nothing when no releases exist", async () => {
		const { scanner, notifier } = makeScanner({
			githubService: { getLatestRelease: vi.fn().mockResolvedValue(null) },
		});

		await scanner.checkRepo("some/repo");

		expect(notifier.sendReleaseNotification).not.toHaveBeenCalled();
	});

	test("stores tag on first check (last_seen_tag = null), no notification", async () => {
		const subscribers = [
			{
				id: 1,
				email: "a@test.com",
				unsubscribe_token: "tokA",
				last_seen_tag: null,
			},
		];
		const { scanner, notifier, repository } = makeScanner({
			githubService: { getLatestRelease: vi.fn().mockResolvedValue("v1.0.0") },
			repository: {
				findConfirmedSubscribersByRepo: vi
					.fn()
					.mockResolvedValue(subscribers),
			},
		});

		await scanner.checkRepo("first/check");

		expect(notifier.sendReleaseNotification).not.toHaveBeenCalled();
		expect(repository.updateLastSeenTag).toHaveBeenCalledWith(1, "v1.0.0");
	});

	test("does not notify when tag is unchanged", async () => {
		const subscribers = [
			{
				id: 1,
				email: "a@test.com",
				unsubscribe_token: "tokA",
				last_seen_tag: "v1.0.0",
			},
		];
		const { scanner, notifier } = makeScanner({
			githubService: { getLatestRelease: vi.fn().mockResolvedValue("v1.0.0") },
			repository: {
				findConfirmedSubscribersByRepo: vi
					.fn()
					.mockResolvedValue(subscribers),
			},
		});

		await scanner.checkRepo("same/tag");

		expect(notifier.sendReleaseNotification).not.toHaveBeenCalled();
	});

	test("notifies all subscribers and updates tag when new release found", async () => {
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
		const { scanner, notifier, repository } = makeScanner({
			githubService: { getLatestRelease: vi.fn().mockResolvedValue("v2.0.0") },
			notifier: {
				sendReleaseNotification: vi.fn().mockResolvedValue(undefined),
			},
			repository: {
				findConfirmedSubscribersByRepo: vi
					.fn()
					.mockResolvedValue(subscribers),
			},
		});

		await scanner.checkRepo("new/release");

		expect(notifier.sendReleaseNotification).toHaveBeenCalledTimes(2);
		expect(notifier.sendReleaseNotification).toHaveBeenCalledWith({
			to: "a@test.com",
			repo: "new/release",
			tag: "v2.0.0",
			unsubscribeToken: "tokA",
		});
		expect(notifier.sendReleaseNotification).toHaveBeenCalledWith({
			to: "b@test.com",
			repo: "new/release",
			tag: "v2.0.0",
			unsubscribeToken: "tokB",
		});
		expect(repository.updateLastSeenTag).toHaveBeenCalledWith(1, "v2.0.0");
		expect(repository.updateLastSeenTag).toHaveBeenCalledWith(2, "v2.0.0");
	});

	test("continues notifying other subscribers if one email fails", async () => {
		const subscribers = [
			{
				id: 1,
				email: "a@test.com",
				unsubscribe_token: "tokA",
				last_seen_tag: "v2.0.0",
			},
			{
				id: 2,
				email: "b@test.com",
				unsubscribe_token: "tokB",
				last_seen_tag: "v2.0.0",
			},
		];
		const sendReleaseNotification = vi
			.fn()
			.mockRejectedValueOnce(new Error("SMTP error"))
			.mockResolvedValueOnce(undefined);

		const { scanner } = makeScanner({
			githubService: { getLatestRelease: vi.fn().mockResolvedValue("v3.0.0") },
			notifier: { sendReleaseNotification },
			repository: {
				findConfirmedSubscribersByRepo: vi
					.fn()
					.mockResolvedValue(subscribers),
			},
		});

		await scanner.checkRepo("mixed/results");

		expect(sendReleaseNotification).toHaveBeenCalledTimes(2);
	});

	test("increments notificationsSentTotal for each successful send", async () => {
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
			notifier: {
				sendReleaseNotification: vi.fn().mockResolvedValue(undefined),
			},
			repository: {
				findConfirmedSubscribersByRepo: vi
					.fn()
					.mockResolvedValue(subscribers),
			},
		});

		await scanner.checkRepo("counter/repo");

		expect(metrics.notificationsSentTotal.inc).toHaveBeenCalledTimes(1);
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

	test("does nothing when no confirmed repos", async () => {
		const { scanner, githubService } = makeScanner({
			repository: { findConfirmedRepos: vi.fn().mockResolvedValue([]) },
		});

		await scanner.scanAllRepos();

		expect(githubService.getLatestRelease).not.toHaveBeenCalled();
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
});
