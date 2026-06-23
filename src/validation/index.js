import { ConfirmError } from "../errors/constants/confirm.js";
import { GetSubscriptionsError } from "../errors/constants/getSubscriptions.js";
import { QueryError } from "../errors/constants/query.js";
import { SubscribeError } from "../errors/constants/subscribe.js";
import { UnsubscribeError } from "../errors/constants/unsubscribe.js";
import { ValidationError } from "../errors/index.js";
import {
	emailQuerySchema,
	repoQuerySchema,
	subscribeSchema,
	tokenSchema,
	updateLastSeenTagSchema,
} from "./schemas.js";

/**
 * Parses input against a Zod schema.
 * Throws a ValidationError with the first issue's message on failure.
 *
 * @template T
 * @param {import("zod").ZodSchema<T>} schema
 * @param {T} data
 * @param {string} errorCode
 * @returns {T}
 * @throws {ValidationError}
 */
function parse(schema, data, errorCode) {
	const result = schema.safeParse(data);
	if (!result.success) {
		const message = result.error.issues[0]?.message ?? "Validation failed";
		throw new ValidationError(message, errorCode);
	}
	return result.data;
}

/**
 * Validates subscribe input: email + repo.
 * @param {{email:string; repo:string}} data
 * @throws {ValidationError}
 */
export function validateSubscribeInput(data) {
	return parse(subscribeSchema, data, SubscribeError.MISSING_FIELDS);
}

/**
 * Validates a confirm token.
 * @param {{token:string}} data
 * @throws {ValidationError}
 */
export function validateConfirmToken(data) {
	return parse(tokenSchema, data, ConfirmError.MISSING_TOKEN);
}

/**
 * Validates an unsubscribe token.
 * @param {{token:string}} data
 * @throws {ValidationError}
 */
export function validateUnsubscribeToken(data) {
	return parse(tokenSchema, data, UnsubscribeError.MISSING_TOKEN);
}

/**
 * Validates an email query parameter.
 * @param {{email:string}} data
 * @throws {ValidationError}
 */
export function validateEmailQuery(data) {
	return parse(emailQuerySchema, data, GetSubscriptionsError.INVALID_EMAIL);
}

/**
 * Validates a repo query parameter (owner/repo format).
 * @param {{repo:string}} data
 * @returns {{repo:string}}
 * @throws {ValidationError}
 */
export function validateRepoQuery(data) {
	return parse(repoQuerySchema, data, QueryError.INVALID_REPO);
}

/**
 * Validates a last-seen-tag update: a positive integer id and a non-empty tag.
 * @param {{id:number|string; tag:string}} data
 * @returns {{id:number; tag:string}}
 * @throws {ValidationError}
 */
export function validateUpdateLastSeenTag(data) {
	return parse(updateLastSeenTagSchema, data, QueryError.INVALID_UPDATE_INPUT);
}
