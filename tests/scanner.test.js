import { describe, test, expect, beforeEach, vi } from "vitest";

vi.mock("../src/services/github", () => ({
	getLatestRelease: vi.fn(),
}));

vi.mock("../src/services/notifier", () => ({
	sendReleaseNotification: vi.fn(),
}));

vi.mock("../src/db/database", () => ({}));

import { getLatestRelease } from "../src/services/github";
import { sendReleaseNotification } from "../src/services/notifier";
import { checkRepo } from "../src/services/scanner";

beforeEach(() => {
	vi.clearAllMocks();
});

/**
 * Builds a minimal mock DB for a given set of subscribers.
 */
function makeDb(subscribers = []) {
	const run = vi.fn().mockReturnValue({ changes: 1 });
	const all = vi.fn().mockReturnValue(subscribers);
	const prepare = vi.fn(() => ({ run, all }));
	return { prepare, _run: run, _all: all };
}

describe("checkRepo", () => {
	test("does nothing when no releases exist", async () => {
		getLatestRelease.mockResolvedValue(null);

		const db = makeDb();

		await checkRepo(db, "some/repo");

		expect(sendReleaseNotification).not.toHaveBeenCalled();
	});

	test("stores tag on first check (last_seen_tag = null), no notification", async () => {
		getLatestRelease.mockResolvedValue("v1.0.0");

		const subscribers = [
			{
				id: 1,
				email: "a@test.com",
				unsubscribe_token: "tok1",
				last_seen_tag: null,
			},
		];

		const db = makeDb(subscribers);

		await checkRepo(db, "first/check");

		expect(sendReleaseNotification).not.toHaveBeenCalled();
		expect(db._run).toHaveBeenCalledWith("v1.0.0", 1);
	});

	test("does not notify when tag is unchanged", async () => {
		getLatestRelease.mockResolvedValue("v1.0.0");

		const subscribers = [
			{
				id: 1,
				email: "a@test.com",
				unsubscribe_token: "tok1",
				last_seen_tag: "v1.0.0",
			},
		];

		const db = makeDb(subscribers);

		await checkRepo(db, "same/tag");

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

		const db = makeDb(subscribers);

		await checkRepo(db, "new/release");

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

		expect(db._run).toHaveBeenCalledWith("v2.0.0", 1);
		expect(db._run).toHaveBeenCalledWith("v2.0.0", 2);
	});

	test("continues notifying other subscribers if one email fails", async () => {
		getLatestRelease.mockResolvedValue("v3.0.0");

		sendReleaseNotification
			.mockRejectedValueOnce(new Error("SMTP error"))
			.mockResolvedValueOnce({});

		const subscribers = [
			{
				id: 1,
				email: "fail@test.com",
				unsubscribe_token: "tok1",
				last_seen_tag: "v2.0.0",
			},
			{
				id: 2,
				email: "ok@test.com",
				unsubscribe_token: "tok2",
				last_seen_tag: "v2.0.0",
			},
		];

		const db = makeDb(subscribers);

		await checkRepo(db, "mixed/results");

		expect(sendReleaseNotification).toHaveBeenCalledTimes(2);
	});
});
