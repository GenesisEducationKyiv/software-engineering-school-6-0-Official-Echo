import { StatusCodes } from "http-status-codes";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("axios");
vi.mock("#src/services/cache.js", () => ({
	cacheGet: vi.fn().mockResolvedValue(null),
	cacheSet: vi.fn().mockResolvedValue(undefined),
}));

let github;
let mockGet;

beforeEach(async () => {
	vi.resetModules();

	mockGet = vi.fn();

	const { default: axios } = await import("axios");
	axios.create = vi.fn().mockReturnValue({ get: mockGet });

	github = await import("#src/services/github.js");
});

describe("GitHub API (mocked)", () => {
	describe("repoExists", () => {
		test("returns true for 200", async () => {
			mockGet.mockResolvedValue({ data: {} });
			expect(await github.repoExists("denoland/deno")).toBe(true);
		});

		test("returns false for 404", async () => {
			mockGet.mockRejectedValue({ response: { status: 404 } });
			expect(await github.repoExists("x/y")).toBe(false);
		});

		test("throws with status 429", async () => {
			mockGet.mockRejectedValue({
				response: { status: 429, headers: { "retry-after": "30" } },
			});

			await expect(github.repoExists("x/y")).rejects.toMatchObject({
				httpStatus: StatusCodes.TOO_MANY_REQUESTS,
				retryAfter: 30,
			});
		});
	});

	describe("getLatestRelease", () => {
		test("returns tag_name on ok", async () => {
			mockGet.mockResolvedValue({ data: { tag_name: "v1.2.3" } });
			expect(await github.getLatestRelease("denoland/deno")).toBe("v1.2.3");
		});

		test("returns null for not found", async () => {
			mockGet.mockRejectedValue({
				response: { status: StatusCodes.NOT_FOUND },
			});
			expect(await github.getLatestRelease("x/y")).toBeNull();
		});

		test("throws with too many requests", async () => {
			mockGet.mockRejectedValue({
				response: {
					status: StatusCodes.TOO_MANY_REQUESTS,
					headers: { "retry-after": "60" },
				},
			});

			await expect(github.getLatestRelease("x/y")).rejects.toMatchObject({
				httpStatus: StatusCodes.TOO_MANY_REQUESTS,
				retryAfter: 60,
			});
		});
	});
});
