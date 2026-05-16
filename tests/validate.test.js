import { describe, expect, test } from "vitest";

import { ValidationError } from "../src/errors/index.js";
import {
	validateConfirmToken,
	validateEmailQuery,
	validateSubscribeInput,
	validateUnsubscribeToken,
} from "../src/validation/index.js";

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
