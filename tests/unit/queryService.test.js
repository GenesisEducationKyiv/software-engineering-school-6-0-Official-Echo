import { beforeEach, describe, expect, test, vi } from "vitest";

import { ValidationError } from "#src/errors/index.js";
import { createQueryService } from "#src/services/queryService.js";

function makeService(overrides = {}) {
	const repository = {
		findConfirmedRepos: vi.fn().mockResolvedValue([]),
		findConfirmedSubscribersByRepo: vi.fn().mockResolvedValue([]),
		updateLastSeenTag: vi.fn().mockResolvedValue(undefined),
		...overrides.repository,
	};

	const service = createQueryService({ repository });
	return { service, repository };
}

describe("findConfirmedRepos()", () => {
	beforeEach(() => vi.clearAllMocks());

	test("returns repo names extracted from repository rows", async () => {
		const { service } = makeService({
			repository: {
				findConfirmedRepos: vi
					.fn()
					.mockResolvedValue([{ repo: "owner/a" }, { repo: "owner/b" }]),
			},
		});

		const result = await service.findConfirmedRepos();
		expect(result.ok).toBe(true);
		expect(result.repos).toEqual(["owner/a", "owner/b"]);
	});

	test("returns empty array when there are no confirmed repos", async () => {
		const { service } = makeService();
		const result = await service.findConfirmedRepos();
		expect(result.repos).toEqual([]);
	});
});

describe("findConfirmedSubscribersByRepo()", () => {
	beforeEach(() => vi.clearAllMocks());

	test("throws ValidationError for empty repo", async () => {
		const { service } = makeService();
		await expect(service.findConfirmedSubscribersByRepo("")).rejects.toThrow(
			ValidationError
		);
	});

	test("throws ValidationError for repo without slash", async () => {
		const { service } = makeService();
		await expect(
			service.findConfirmedSubscribersByRepo("noslash")
		).rejects.toThrow(ValidationError);
	});

	test("does not call the repository when validation fails", async () => {
		const { service, repository } = makeService();
		await expect(service.findConfirmedSubscribersByRepo("")).rejects.toThrow(
			ValidationError
		);
		expect(repository.findConfirmedSubscribersByRepo).not.toHaveBeenCalled();
	});

	test("maps subscriber rows, defaulting missing last_seen_tag to null", async () => {
		const { service } = makeService({
			repository: {
				findConfirmedSubscribersByRepo: vi.fn().mockResolvedValue([
					{
						id: 1,
						email: "u@x.com",
						unsubscribe_token: "tok-1",
						last_seen_tag: "v1.0.0",
					},
					{
						id: 2,
						email: "v@x.com",
						unsubscribe_token: "tok-2",
						last_seen_tag: null,
					},
				]),
			},
		});

		const result = await service.findConfirmedSubscribersByRepo("owner/repo");
		expect(result.ok).toBe(true);
		expect(result.subscribers).toEqual([
			{
				id: 1,
				email: "u@x.com",
				unsubscribe_token: "tok-1",
				last_seen_tag: "v1.0.0",
			},
			{
				id: 2,
				email: "v@x.com",
				unsubscribe_token: "tok-2",
				last_seen_tag: null,
			},
		]);
	});

	test("calls repository with the validated repo", async () => {
		const { service, repository } = makeService();
		await service.findConfirmedSubscribersByRepo("owner/repo");
		expect(repository.findConfirmedSubscribersByRepo).toHaveBeenCalledWith(
			"owner/repo"
		);
	});
});

describe("updateLastSeenTag()", () => {
	beforeEach(() => vi.clearAllMocks());

	test("throws ValidationError for a non-numeric id", async () => {
		const { service } = makeService();
		await expect(
			service.updateLastSeenTag("not-a-number", "v1.0.0")
		).rejects.toThrow(ValidationError);
	});

	test("throws ValidationError for a zero or negative id", async () => {
		const { service } = makeService();
		await expect(service.updateLastSeenTag(0, "v1.0.0")).rejects.toThrow(
			ValidationError
		);
	});

	test("throws ValidationError for an empty tag", async () => {
		const { service } = makeService();
		await expect(service.updateLastSeenTag(1, "")).rejects.toThrow(
			ValidationError
		);
	});

	test("does not call the repository when validation fails", async () => {
		const { service, repository } = makeService();
		await expect(service.updateLastSeenTag(1, "")).rejects.toThrow(
			ValidationError
		);
		expect(repository.updateLastSeenTag).not.toHaveBeenCalled();
	});

	test("coerces a numeric-string id and calls repository with a number", async () => {
		const { service, repository } = makeService();
		await service.updateLastSeenTag("42", "v2.0.0");
		expect(repository.updateLastSeenTag).toHaveBeenCalledWith(42, "v2.0.0");
	});

	test("returns ok:true on success", async () => {
		const { service } = makeService();
		const result = await service.updateLastSeenTag(1, "v1.0.0");
		expect(result).toEqual({ ok: true });
	});
});
