import { StatusCodes } from "http-status-codes";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("axios");

// A no-op cache that always misses — lets us test the HTTP path every time
const noopCache = {
	get: vi.fn().mockResolvedValue(null),
	set: vi.fn().mockResolvedValue(undefined),
};

let githubService;
let mockGet;

beforeEach(async () => {
	vi.resetModules();
	vi.clearAllMocks();

	mockGet = vi.fn();

	const { default: axios } = await import("axios");
	axios.create = vi.fn().mockReturnValue({ get: mockGet });

	const { createGithubService } = await import("#src/services/github.js");
	githubService = createGithubService(noopCache);
});

describe("repoExists", () => {
	test("returns true for 200", async () => {
		mockGet.mockResolvedValue({ data: {} });
		expect(await githubService.repoExists("denoland/deno")).toBe(true);
	});

	test("returns false for 404", async () => {
		mockGet.mockRejectedValue({ response: { status: 404 } });
		expect(await githubService.repoExists("x/y")).toBe(false);
	});

	test("throws RateLimitError with retryAfter for 429", async () => {
		mockGet.mockRejectedValue({
			response: { status: 429, headers: { "retry-after": "30" } },
		});

		await expect(githubService.repoExists("x/y")).rejects.toMatchObject({
			retryAfter: 30,
			code: "RATE_LIMITED",
		});
	});

	test("uses cache hit and skips HTTP call", async () => {
		const cachingCache = {
			get: vi.fn().mockResolvedValue(true),
			set: vi.fn(),
		};
		const { createGithubService } = await import("#src/services/github.js");
		const svc = createGithubService(cachingCache);

		const result = await svc.repoExists("anything/repo");
		expect(result).toBe(true);
		expect(mockGet).not.toHaveBeenCalled();
	});
});

describe("getLatestRelease", () => {
	test("returns tag_name on 200", async () => {
		mockGet.mockResolvedValue({ data: { tag_name: "v1.2.3" } });
		expect(await githubService.getLatestRelease("denoland/deno")).toBe("v1.2.3");
	});

	test("returns null for 404", async () => {
		mockGet.mockRejectedValue({ response: { status: StatusCodes.NOT_FOUND } });
		expect(await githubService.getLatestRelease("x/y")).toBeNull();
	});

	test("throws RateLimitError for 429", async () => {
		mockGet.mockRejectedValue({
			response: {
				status: StatusCodes.TOO_MANY_REQUESTS,
				headers: { "retry-after": "60" },
			},
		});

		await expect(githubService.getLatestRelease("x/y")).rejects.toMatchObject({
			retryAfter: 60,
			code: "RATE_LIMITED",
		});
	});

	test("uses cache hit and skips HTTP call", async () => {
		const cachingCache = {
			get: vi.fn().mockResolvedValue("v9.9.9"),
			set: vi.fn(),
		};
		const { createGithubService } = await import("#src/services/github.js");
		const svc = createGithubService(cachingCache);

		const result = await svc.getLatestRelease("anything/repo");
		expect(result).toBe("v9.9.9");
		expect(mockGet).not.toHaveBeenCalled();
	});
});
