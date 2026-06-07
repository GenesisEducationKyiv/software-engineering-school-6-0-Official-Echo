import { describe, expect, test } from "vitest";

import { buildConfirmationEmail } from "#src/emails/confirmation.js";
import { buildReleaseEmail } from "#src/emails/release.js";

describe("buildConfirmationEmail()", () => {
	const params = {
		to: "user@example.com",
		repo: "facebook/react",
		confirmToken: "abc-123-token",
		baseUrl: "http://localhost:3000",
	};

	test("sets to from email param", () => {
		const result = buildConfirmationEmail(params);
		expect(result.to).toBe("user@example.com");
	});

	test("includes repo in subject", () => {
		const result = buildConfirmationEmail(params);
		expect(result.subject).toContain("facebook/react");
	});

	test("includes confirm URL in text body", () => {
		const result = buildConfirmationEmail(params);
		expect(result.text).toContain(
			"http://localhost:3000/api/confirm/abc-123-token"
		);
	});

	test("includes confirm URL in html body", () => {
		const result = buildConfirmationEmail(params);
		expect(result.html).toContain(
			"http://localhost:3000/api/confirm/abc-123-token"
		);
	});

	test("returns all required fields", () => {
		const result = buildConfirmationEmail(params);
		expect(result).toHaveProperty("to");
		expect(result).toHaveProperty("subject");
		expect(result).toHaveProperty("text");
		expect(result).toHaveProperty("html");
	});

	test("different tokens produce different URLs", () => {
		const a = buildConfirmationEmail({ ...params, confirmToken: "token-A" });
		const b = buildConfirmationEmail({ ...params, confirmToken: "token-B" });
		expect(a.text).not.toBe(b.text);
	});
});

describe("buildReleaseEmail()", () => {
	const params = {
		to: "user@example.com",
		repo: "denoland/deno",
		tag: "v2.0.0",
		unsubscribeToken: "unsub-xyz",
		baseUrl: "http://localhost:3000",
	};

	test("sets to from email param", () => {
		const result = buildReleaseEmail(params);
		expect(result.to).toBe("user@example.com");
	});

	test("includes repo and tag in subject", () => {
		const result = buildReleaseEmail(params);
		expect(result.subject).toContain("denoland/deno");
		expect(result.subject).toContain("v2.0.0");
	});

	test("includes GitHub release URL in text body", () => {
		const result = buildReleaseEmail(params);
		expect(result.text).toContain(
			"https://github.com/denoland/deno/releases/tag/v2.0.0"
		);
	});

	test("includes unsubscribe URL in text body", () => {
		const result = buildReleaseEmail(params);
		expect(result.text).toContain(
			"http://localhost:3000/api/unsubscribe/unsub-xyz"
		);
	});

	test("includes GitHub release URL in html body", () => {
		const result = buildReleaseEmail(params);
		expect(result.html).toContain(
			"https://github.com/denoland/deno/releases/tag/v2.0.0"
		);
	});

	test("includes unsubscribe URL in html body", () => {
		const result = buildReleaseEmail(params);
		expect(result.html).toContain(
			"http://localhost:3000/api/unsubscribe/unsub-xyz"
		);
	});

	test("returns all required fields", () => {
		const result = buildReleaseEmail(params);
		expect(result).toHaveProperty("to");
		expect(result).toHaveProperty("subject");
		expect(result).toHaveProperty("text");
		expect(result).toHaveProperty("html");
	});
});
