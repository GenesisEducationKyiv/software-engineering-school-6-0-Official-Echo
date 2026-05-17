import { beforeEach, describe, expect, test, vi } from "vitest";

import { RateLimitError } from "#src/errors/index.js";
import { findConfirmedRepos } from "#src/repositories/subscriptionRepository.js";
import { scanAllRepos } from "#src/services/scanner.js";

vi.mock("#src/services/github.js", () => ({
	getLatestRelease: vi.fn(),
}));

vi.mock("#src/services/notifier.js", () => ({
	sendReleaseNotification: vi.fn(),
}));

vi.mock("#src/repositories/subscriptionRepository.js", () => ({
	findConfirmedSubscribersByRepo: vi.fn(),
	updateLastSeenTag: vi.fn(),
	findConfirmedRepos: vi.fn(),
}));

vi.mock("#src/services/metrics.js", () => ({
	notificationsSentTotal: { inc: vi.fn() },
	scannerRunsTotal: { inc: vi.fn() },
}));

import {
	findConfirmedSubscribersByRepo,
	updateLastSeenTag,
} from "#src/repositories/subscriptionRepository.js";
import { getLatestRelease } from "#src/services/github.js";
// eslint-disable-next-line no-unused-vars
import { notificationsSentTotal, scannerRunsTotal } from "#src/services/metrics.js";
import { sendReleaseNotification } from "#src/services/notifier.js";
import { checkRepo } from "#src/services/scanner.js";

beforeEach(() => {
	vi.clearAllMocks();
});

describe("checkRepo", () => {
	test("does nothing when no releases exist", async () => {
		getLatestRelease.mockResolvedValue(null);

		await checkRepo("some/repo");

		expect(sendReleaseNotification).not.toHaveBeenCalled();
	});

	test("stores tag on first check (last_seen_tag = null), no notification", async () => {
		getLatestRelease.mockResolvedValue("v1.0.0");

		const subscribers = [
			{
				id: 1,
				email: "a@test.com",
				unsubscribe_token: "tokA",
				last_seen_tag: null,
			},
		];
		findConfirmedSubscribersByRepo.mockResolvedValue(subscribers);

		await checkRepo("first/check");

		expect(sendReleaseNotification).not.toHaveBeenCalled();
		expect(updateLastSeenTag).toHaveBeenCalledWith(1, "v1.0.0");
	});

	test("does not notify when tag is unchanged", async () => {
		getLatestRelease.mockResolvedValue("v1.0.0");

		const subscribers = [
			{
				id: 1,
				email: "a@test.com",
				unsubscribe_token: "tokA",
				last_seen_tag: "v1.0.0",
			},
		];
		findConfirmedSubscribersByRepo.mockResolvedValue(subscribers);

		await checkRepo("same/tag");

		expect(sendReleaseNotification).not.toHaveBeenCalled();
	});

	test("notifies all subscribers and updates tag when new release found", async () => {
		getLatestRelease.mockResolvedValue("v2.0.0");
		sendReleaseNotification.mockResolvedValue({});

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
		findConfirmedSubscribersByRepo.mockResolvedValue(subscribers);

		await checkRepo("new/release");

		expect(sendReleaseNotification).toHaveBeenCalledTimes(2);

		expect(sendReleaseNotification).toHaveBeenCalledWith({
			email: "a@test.com",
			repo: "new/release",
			tag: "v2.0.0",
			unsubscribeToken: "tokA",
		});

		expect(sendReleaseNotification).toHaveBeenCalledWith({
			email: "b@test.com",
			repo: "new/release",
			tag: "v2.0.0",
			unsubscribeToken: "tokB",
		});

		expect(updateLastSeenTag).toHaveBeenCalledWith(1, "v2.0.0");
		expect(updateLastSeenTag).toHaveBeenCalledWith(2, "v2.0.0");
	});

	test("continues notifying other subscribers if one email fails", async () => {
		getLatestRelease.mockResolvedValue("v3.0.0");

		sendReleaseNotification
			.mockRejectedValueOnce(new Error("SMTP error"))
			.mockResolvedValueOnce({});

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
		findConfirmedSubscribersByRepo.mockResolvedValue(subscribers);

		await checkRepo("mixed/results");

		expect(sendReleaseNotification).toHaveBeenCalledTimes(2);
	});
});

describe("scanAllRepos", () => {
	test("increments scanner run counter", async () => {
		findConfirmedRepos.mockResolvedValue([]);
		await scanAllRepos();
		expect(scannerRunsTotal.inc).toHaveBeenCalled();
	});

	test("does nothing when no confirmed repos", async () => {
		findConfirmedRepos.mockResolvedValue([]);
		await scanAllRepos();
		expect(getLatestRelease).not.toHaveBeenCalled();
	});

	test("stops on RateLimitError and skips remaining repos", async () => {
		findConfirmedRepos.mockResolvedValue([
			{ repo: "a/one" },
			{ repo: "b/two" },
			{ repo: "c/three" },
		]);
		getLatestRelease
			.mockResolvedValueOnce(null)
			.mockRejectedValueOnce(
				new RateLimitError("rate limited", "RATE_LIMITED", 30)
			)
			.mockResolvedValueOnce(null);
		findConfirmedSubscribersByRepo.mockResolvedValue([]);
		await scanAllRepos();
		expect(getLatestRelease).toHaveBeenCalledTimes(2);
	});

	test("continues after a non-rate-limit error", async () => {
		findConfirmedRepos.mockResolvedValue([{ repo: "a/one" }, { repo: "b/two" }]);
		getLatestRelease
			.mockRejectedValueOnce(new Error("network error"))
			.mockResolvedValueOnce(null);
		await scanAllRepos();
		expect(getLatestRelease).toHaveBeenCalledTimes(2);
	});
});
