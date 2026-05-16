import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../../src/repositories/subscriptionRepository.js", () => ({
	insertSubscription: vi.fn(),
	findByConfirmToken: vi.fn(),
	confirmSubscription: vi.fn(),
	deleteByUnsubscribeToken: vi.fn(),
	findAllByEmail: vi.fn(),
}));

vi.mock("../../src/services/github.js", () => ({
	repoExists: vi.fn(),
}));

vi.mock("../../src/services/notifier.js", () => ({
	sendConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}));

import {
	ConflictError,
	NotFoundError,
	RateLimitError,
	ValidationError,
} from "../../src/errors/index.js";
import {
	confirmSubscription,
	deleteByUnsubscribeToken,
	findAllByEmail,
	findByConfirmToken,
	insertSubscription,
} from "../../src/repositories/subscriptionRepository.js";
import { repoExists } from "../../src/services/github.js";
import { sendConfirmationEmail } from "../../src/services/notifier.js";
import {
	confirm,
	getSubscriptions,
	subscribe,
	unsubscribe,
} from "../../src/services/subscriptionService.js";

describe("subscribe()", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(repoExists).mockResolvedValue(true);
		vi.mocked(insertSubscription).mockResolvedValue(undefined);
		vi.mocked(sendConfirmationEmail).mockResolvedValue(undefined);
	});

	test("throws ValidationError for empty email", async () => {
		await expect(subscribe("", "owner/repo")).rejects.toThrow(ValidationError);
	});

	test("throws ValidationError for invalid email", async () => {
		await expect(subscribe("not-email", "owner/repo")).rejects.toThrow(
			ValidationError
		);
	});

	test("throws ValidationError for empty repo", async () => {
		await expect(subscribe("user@example.com", "")).rejects.toThrow(
			ValidationError
		);
	});

	test("throws ValidationError for repo without slash", async () => {
		await expect(subscribe("user@example.com", "noslash")).rejects.toThrow(
			ValidationError
		);
	});

	test("throws NotFoundError when repo does not exist", async () => {
		vi.mocked(repoExists).mockResolvedValue(false);
		await expect(subscribe("user@example.com", "ghost/missing")).rejects.toThrow(
			NotFoundError
		);
	});

	test("propagates RateLimitError from repoExists", async () => {
		vi.mocked(repoExists).mockRejectedValue(
			new RateLimitError("rate limited", "RATE_LIMITED")
		);
		await expect(subscribe("user@example.com", "owner/repo")).rejects.toThrow(
			RateLimitError
		);
	});

	test("throws ConflictError on UNIQUE constraint violation", async () => {
		vi.mocked(insertSubscription).mockRejectedValue(
			new Error("UNIQUE constraint failed: subscriptions.confirm_token")
		);
		await expect(subscribe("user@example.com", "owner/repo")).rejects.toThrow(
			ConflictError
		);
	});

	test("throws generic Error on other DB failures", async () => {
		vi.mocked(insertSubscription).mockRejectedValue(new Error("disk full"));
		await expect(subscribe("user@example.com", "owner/repo")).rejects.toThrow(
			"Database error"
		);
	});

	test("calls insertSubscription with uuid tokens", async () => {
		await subscribe("user@example.com", "owner/repo");
		expect(insertSubscription).toHaveBeenCalledWith(
			"user@example.com",
			"owner/repo",
			expect.stringMatching(/^[0-9a-f-]{36}$/),
			expect.stringMatching(/^[0-9a-f-]{36}$/)
		);
	});

	test("calls sendConfirmationEmail with correct args", async () => {
		await subscribe("user@example.com", "owner/repo");
		expect(sendConfirmationEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				email: "user@example.com",
				repo: "owner/repo",
				confirmToken: expect.stringMatching(/^[0-9a-f-]{36}$/),
			})
		);
	});

	test("returns success message", async () => {
		const result = await subscribe("user@example.com", "owner/repo");
		expect(result.ok).toBe(true);
		expect(result.message).toMatch(/confirm/i);
	});
});

describe("confirm()", () => {
	beforeEach(() => vi.clearAllMocks());

	test("throws ValidationError for empty token", async () => {
		await expect(confirm("")).rejects.toThrow(ValidationError);
	});

	test("throws NotFoundError for unknown token", async () => {
		vi.mocked(findByConfirmToken).mockResolvedValue(undefined);
		await expect(confirm("no-such-token")).rejects.toThrow(NotFoundError);
	});

	test("returns alreadyConfirmed=true when already confirmed", async () => {
		vi.mocked(findByConfirmToken).mockResolvedValue({ confirmed: 1 });
		const result = await confirm("some-token");
		expect(result.alreadyConfirmed).toBe(true);
		expect(confirmSubscription).not.toHaveBeenCalled();
	});

	test("confirms and returns success for unconfirmed token", async () => {
		vi.mocked(findByConfirmToken).mockResolvedValue({ confirmed: 0 });
		vi.mocked(confirmSubscription).mockResolvedValue(undefined);
		const result = await confirm("valid-token");
		expect(result.ok).toBe(true);
		expect(confirmSubscription).toHaveBeenCalledWith("valid-token");
	});
});

describe("unsubscribe()", () => {
	beforeEach(() => vi.clearAllMocks());

	test("throws ValidationError for empty token", async () => {
		await expect(unsubscribe("")).rejects.toThrow(ValidationError);
	});

	test("throws NotFoundError when no rows deleted", async () => {
		vi.mocked(deleteByUnsubscribeToken).mockResolvedValue({ changes: 0 });
		await expect(unsubscribe("ghost-token")).rejects.toThrow(NotFoundError);
	});

	test("returns success when row is deleted", async () => {
		vi.mocked(deleteByUnsubscribeToken).mockResolvedValue({ changes: 1 });
		const result = await unsubscribe("valid-unsub-token");
		expect(result.ok).toBe(true);
		expect(result.message).toMatch(/unsubscribed/i);
	});
});

describe("getSubscriptions()", () => {
	beforeEach(() => vi.clearAllMocks());

	test("throws ValidationError for empty email", async () => {
		await expect(getSubscriptions("")).rejects.toThrow(ValidationError);
	});

	test("throws ValidationError for invalid email", async () => {
		await expect(getSubscriptions("not-email")).rejects.toThrow(ValidationError);
	});

	test("returns mapped subscriptions with boolean confirmed", async () => {
		vi.mocked(findAllByEmail).mockResolvedValue([
			{ email: "u@x.com", repo: "a/b", confirmed: 1, last_seen_tag: "v2" },
			{ email: "u@x.com", repo: "c/d", confirmed: 0, last_seen_tag: null },
		]);

		const result = await getSubscriptions("u@x.com");
		expect(result.ok).toBe(true);
		expect(result.subscriptions).toHaveLength(2);
		expect(result.subscriptions[0]).toEqual({
			email: "u@x.com",
			repo: "a/b",
			confirmed: true,
			last_seen_tag: "v2",
		});
		expect(result.subscriptions[1].confirmed).toBe(false);
	});

	test("returns empty array when no subscriptions exist", async () => {
		vi.mocked(findAllByEmail).mockResolvedValue([]);
		const result = await getSubscriptions("nobody@example.com");
		expect(result.subscriptions).toEqual([]);
	});
});
