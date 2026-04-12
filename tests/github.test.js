const { isValidRepoFormat } = require("../src/services/github");

describe("isValidRepoFormat", () => {
	test.each([
		["denoland/deno", true],
		["facebook/react", true],
		["user-123/my_repo.js", true],
		["org.name/repo-name", true],
	])("accepts valid: %s", (input, expected) => {
		expect(isValidRepoFormat(input)).toBe(expected);
	});

	test.each([
		["denoland", false],
		["/deno", false],
		["denoland/", false],
		["", false],
		["a/b/c", false],
		["user name/repo", false],
		["user@name/repo", false],
	])("rejects invalid: %s", (input, expected) => {
		expect(isValidRepoFormat(input)).toBe(expected);
	});
});

describe("GitHub API (mocked)", () => {
	let github;
	const mockGet = jest.fn();

	beforeEach(() => {
		jest.resetModules();
		jest.mock("axios", () => ({ create: () => ({ get: mockGet }) }));
		mockGet.mockReset();
		github = require("../src/services/github");
	});

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
				status: 429,
			});
		});
	});

	describe("getLatestRelease", () => {
		test("returns tag_name on 200", async () => {
			mockGet.mockResolvedValue({ data: { tag_name: "v1.2.3" } });
			expect(await github.getLatestRelease("denoland/deno")).toBe("v1.2.3");
		});

		test("returns null for 404", async () => {
			mockGet.mockRejectedValue({ response: { status: 404 } });
			expect(await github.getLatestRelease("x/y")).toBeNull();
		});

		test("throws with status 429", async () => {
			mockGet.mockRejectedValue({
				response: { status: 429, headers: { "retry-after": "60" } },
			});
			await expect(github.getLatestRelease("x/y")).rejects.toMatchObject({
				status: 429,
			});
		});
	});
});
