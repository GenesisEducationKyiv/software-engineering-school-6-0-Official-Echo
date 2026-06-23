import { describe, expect, test } from "vitest";

import { ValidationError } from "#src/errors/index.js";
import {
	validateConfirmToken,
	validateEmailQuery,
	validateRepoQuery,
	validateSubscribeInput,
	validateUnsubscribeToken,
	validateUpdateLastSeenTag,
} from "#src/validation/index.js";

describe("validateSubscribeInput", () => {
	test("passes with valid email and repo", () => {
		expect(() =>
			validateSubscribeInput({ email: "a@b.com", repo: "owner/repo" })
		).not.toThrow();
	});

	test("throws when email is missing", () => {
		expect(() =>
			validateSubscribeInput({ email: "", repo: "owner/repo" })
		).toThrow(ValidationError);
	});

	test("throws when repo is missing", () => {
		expect(() => validateSubscribeInput({ email: "a@b.com", repo: "" })).toThrow(
			ValidationError
		);
	});

	test("throws for invalid email format", () => {
		expect(() =>
			validateSubscribeInput({ email: "not-an-email", repo: "owner/repo" })
		).toThrow(ValidationError);
	});

	test("throws for invalid repo format (no slash)", () => {
		expect(() =>
			validateSubscribeInput({ email: "a@b.com", repo: "justarepo" })
		).toThrow(ValidationError);
	});

	test("throws for invalid repo format (spaces)", () => {
		expect(() =>
			validateSubscribeInput({ email: "a@b.com", repo: "owner /repo" })
		).toThrow(ValidationError);
	});
});

describe("validateConfirmToken", () => {
	test("passes with a non-empty token", () => {
		expect(() => validateConfirmToken({ token: "abc123" })).not.toThrow();
	});

	test("throws when token is empty", () => {
		expect(() => validateConfirmToken({ token: "" })).toThrow(ValidationError);
	});

	test("throws when token is missing", () => {
		expect(() => validateConfirmToken({})).toThrow(ValidationError);
	});
});

describe("validateUnsubscribeToken", () => {
	test("passes with a non-empty token", () => {
		expect(() => validateUnsubscribeToken({ token: "abc123" })).not.toThrow();
	});

	test("throws when token is empty", () => {
		expect(() => validateUnsubscribeToken({ token: "" })).toThrow(
			ValidationError
		);
	});
});

describe("validateEmailQuery", () => {
	test("passes with a valid email", () => {
		expect(() =>
			validateEmailQuery({ email: "user@example.com" })
		).not.toThrow();
	});

	test("throws for invalid email format", () => {
		expect(() => validateEmailQuery({ email: "not-valid" })).toThrow(
			ValidationError
		);
	});

	test("throws when email is missing", () => {
		expect(() => validateEmailQuery({})).toThrow(ValidationError);
	});
});

describe("validateRepoQuery", () => {
	test("passes with a valid owner/repo string", () => {
		expect(() => validateRepoQuery({ repo: "owner/repo" })).not.toThrow();
	});

	test("throws when repo is missing", () => {
		expect(() => validateRepoQuery({})).toThrow(ValidationError);
	});

	test("throws when repo is empty", () => {
		expect(() => validateRepoQuery({ repo: "" })).toThrow(ValidationError);
	});

	test("throws for invalid repo format (no slash)", () => {
		expect(() => validateRepoQuery({ repo: "justarepo" })).toThrow(
			ValidationError
		);
	});
});

describe("validateUpdateLastSeenTag", () => {
	test("passes with a numeric id and non-empty tag", () => {
		expect(() =>
			validateUpdateLastSeenTag({ id: 1, tag: "v1.0.0" })
		).not.toThrow();
	});

	test("coerces a numeric string id", () => {
		const result = validateUpdateLastSeenTag({ id: "42", tag: "v1.0.0" });
		expect(result.id).toBe(42);
	});

	test("throws when id is missing", () => {
		expect(() => validateUpdateLastSeenTag({ tag: "v1.0.0" })).toThrow(
			ValidationError
		);
	});

	test("throws when id is not numeric", () => {
		expect(() =>
			validateUpdateLastSeenTag({ id: "abc", tag: "v1.0.0" })
		).toThrow(ValidationError);
	});

	test("throws when id is zero or negative", () => {
		expect(() => validateUpdateLastSeenTag({ id: 0, tag: "v1.0.0" })).toThrow(
			ValidationError
		);
		expect(() => validateUpdateLastSeenTag({ id: -1, tag: "v1.0.0" })).toThrow(
			ValidationError
		);
	});

	test("throws when tag is empty", () => {
		expect(() => validateUpdateLastSeenTag({ id: 1, tag: "" })).toThrow(
			ValidationError
		);
	});

	test("throws when tag is missing", () => {
		expect(() => validateUpdateLastSeenTag({ id: 1 })).toThrow(ValidationError);
	});
});
