import { beforeEach, describe, expect, test, vi } from "vitest";

import {
	ConflictError,
	NotFoundError,
	RateLimitError,
	ValidationError,
} from "#src/errors/index.js";
import { createSubscriptionService } from "#src/services/subscriptionService.js";

// subscriptionService is now a factory — all deps injected as plain objects.
// No vi.mock() of concrete modules needed at all.

function makeService(overrides = {}) {
	const repository = {
		insertSubscription: vi.fn().mockResolvedValue(undefined),
		findByConfirmToken: vi.fn().mockResolvedValue(undefined),
		confirmSubscription: vi.fn().mockResolvedValue(undefined),
		deleteByUnsubscribeToken: vi.fn().mockResolvedValue({ changes: 1 }),
		findAllByEmail: vi.fn().mockResolvedValue([]),
		...overrides.repository,
	};
	const githubService = {
		repoExists: vi.fn().mockResolvedValue(true),
		...overrides.githubService,
	};
	const notifier = {
		sendConfirmationEmail: vi.fn().mockResolvedValue(undefined),
		...overrides.notifier,
	};

	const service = createSubscriptionService({
		repository,
		githubService,
		notifier,
	});
	return { service, repository, githubService, notifier };
}

describe("subscribe()", () => {
	beforeEach(() => vi.clearAllMocks());

	test("throws ValidationError for empty email", async () => {
		const { service } = makeService();
		await expect(service.subscribe("", "owner/repo")).rejects.toThrow(
			ValidationError
		);
	});

	test("throws ValidationError for invalid email", async () => {
		const { service } = makeService();
		await expect(service.subscribe("not-email", "owner/repo")).rejects.toThrow(
			ValidationError
		);
	});

	test("throws ValidationError for empty repo", async () => {
		const { service } = makeService();
		await expect(service.subscribe("user@example.com", "")).rejects.toThrow(
			ValidationError
		);
	});

	test("throws ValidationError for repo without slash", async () => {
		const { service } = makeService();
		await expect(
			service.subscribe("user@example.com", "noslash")
		).rejects.toThrow(ValidationError);
	});

	test("throws NotFoundError when repo does not exist", async () => {
		const { service } = makeService({
			githubService: { repoExists: vi.fn().mockResolvedValue(false) },
		});
		await expect(
			service.subscribe("user@example.com", "ghost/missing")
		).rejects.toThrow(NotFoundError);
	});

	test("propagates RateLimitError from repoExists", async () => {
		const { service } = makeService({
			githubService: {
				repoExists: vi
					.fn()
					.mockRejectedValue(
						new RateLimitError("rate limited", "RATE_LIMITED")
					),
			},
		});
		await expect(
			service.subscribe("user@example.com", "owner/repo")
		).rejects.toThrow(RateLimitError);
	});

	test("throws ConflictError on UNIQUE constraint violation", async () => {
		const { service } = makeService({
			repository: {
				insertSubscription: vi
					.fn()
					.mockRejectedValue(
						new Error(
							"UNIQUE constraint failed: subscriptions.confirm_token"
						)
					),
			},
		});
		await expect(
			service.subscribe("user@example.com", "owner/repo")
		).rejects.toThrow(ConflictError);
	});

	test("throws generic Error on other DB failures", async () => {
		const { service } = makeService({
			repository: {
				insertSubscription: vi
					.fn()
					.mockRejectedValue(new Error("disk full")),
			},
		});
		await expect(
			service.subscribe("user@example.com", "owner/repo")
		).rejects.toThrow("Database error");
	});

	test("calls insertSubscription with uuid tokens", async () => {
		const { service, repository } = makeService();
		await service.subscribe("user@example.com", "owner/repo");
		expect(repository.insertSubscription).toHaveBeenCalledWith(
			"user@example.com",
			"owner/repo",
			expect.stringMatching(/^[0-9a-f-]{36}$/),
			expect.stringMatching(/^[0-9a-f-]{36}$/)
		);
	});

	test("calls sendConfirmationEmail with correct args", async () => {
		const { service, notifier } = makeService();
		await service.subscribe("user@example.com", "owner/repo");
		expect(notifier.sendConfirmationEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				to: "user@example.com",
				repo: "owner/repo",
				confirmToken: expect.stringMatching(/^[0-9a-f-]{36}$/),
			})
		);
	});

	test("returns success message", async () => {
		const { service } = makeService();
		const result = await service.subscribe("user@example.com", "owner/repo");
		expect(result.ok).toBe(true);
		expect(result.message).toMatch(/confirm/i);
	});
});

describe("confirm()", () => {
	beforeEach(() => vi.clearAllMocks());

	test("throws ValidationError for empty token", async () => {
		const { service } = makeService();
		await expect(service.confirm("")).rejects.toThrow(ValidationError);
	});

	test("throws NotFoundError for unknown token", async () => {
		const { service } = makeService({
			repository: { findByConfirmToken: vi.fn().mockResolvedValue(undefined) },
		});
		await expect(service.confirm("no-such-token")).rejects.toThrow(
			NotFoundError
		);
	});

	test("returns alreadyConfirmed=true when already confirmed", async () => {
		const { service, repository } = makeService({
			repository: {
				findByConfirmToken: vi.fn().mockResolvedValue({ confirmed: 1 }),
			},
		});
		const result = await service.confirm("some-token");
		expect(result.alreadyConfirmed).toBe(true);
		expect(repository.confirmSubscription).not.toHaveBeenCalled();
	});

	test("confirms and returns success for unconfirmed token", async () => {
		const { service, repository } = makeService({
			repository: {
				findByConfirmToken: vi.fn().mockResolvedValue({ confirmed: 0 }),
			},
		});
		const result = await service.confirm("valid-token");
		expect(result.ok).toBe(true);
		expect(repository.confirmSubscription).toHaveBeenCalledWith("valid-token");
	});
});

describe("unsubscribe()", () => {
	beforeEach(() => vi.clearAllMocks());

	test("throws ValidationError for empty token", async () => {
		const { service } = makeService();
		await expect(service.unsubscribe("")).rejects.toThrow(ValidationError);
	});

	test("throws NotFoundError when no rows deleted", async () => {
		const { service } = makeService({
			repository: {
				deleteByUnsubscribeToken: vi.fn().mockResolvedValue({ changes: 0 }),
			},
		});
		await expect(service.unsubscribe("ghost-token")).rejects.toThrow(
			NotFoundError
		);
	});

	test("returns success when row is deleted", async () => {
		const { service } = makeService({
			repository: {
				deleteByUnsubscribeToken: vi.fn().mockResolvedValue({ changes: 1 }),
			},
		});
		const result = await service.unsubscribe("valid-unsub-token");
		expect(result.ok).toBe(true);
		expect(result.message).toMatch(/unsubscribed/i);
	});
});

describe("getSubscriptions()", () => {
	beforeEach(() => vi.clearAllMocks());

	test("throws ValidationError for empty email", async () => {
		const { service } = makeService();
		await expect(service.getSubscriptions("")).rejects.toThrow(ValidationError);
	});

	test("throws ValidationError for invalid email", async () => {
		const { service } = makeService();
		await expect(service.getSubscriptions("not-email")).rejects.toThrow(
			ValidationError
		);
	});

	test("returns mapped subscriptions with boolean confirmed", async () => {
		const { service } = makeService({
			repository: {
				findAllByEmail: vi.fn().mockResolvedValue([
					{
						email: "u@x.com",
						repo: "a/b",
						confirmed: 1,
						last_seen_tag: "v2",
					},
					{
						email: "u@x.com",
						repo: "c/d",
						confirmed: 0,
						last_seen_tag: null,
					},
				]),
			},
		});

		const result = await service.getSubscriptions("u@x.com");
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
		const { service } = makeService({
			repository: { findAllByEmail: vi.fn().mockResolvedValue([]) },
		});
		const result = await service.getSubscriptions("nobody@example.com");
		expect(result.subscriptions).toEqual([]);
	});
});
