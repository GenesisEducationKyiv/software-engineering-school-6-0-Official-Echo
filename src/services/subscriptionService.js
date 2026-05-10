import { v4 as uuidv4 } from "uuid";

import {
	confirmSubscription,
	deleteByUnsubscribeToken,
	findAllByEmail,
	findByConfirmToken,
	insertSubscription,
} from "../repositories/subscriptionRepository.js";
import { isValidRepoFormat, repoExists } from "./github.js";
import { sendConfirmationEmail } from "./notifier.js";

export const SubscribeError = Object.freeze({
	MISSING_FIELDS: "MISSING_FIELDS",
	INVALID_EMAIL: "INVALID_EMAIL",
	INVALID_REPO_FORMAT: "INVALID_REPO_FORMAT",
	REPO_NOT_FOUND: "REPO_NOT_FOUND",
	RATE_LIMITED: "RATE_LIMITED",
	ALREADY_EXISTS: "ALREADY_EXISTS",
	INTERNAL: "INTERNAL",
});

/**
 * Subscribes an email to repo release notifications.
 * @returns {{ ok: true, message: string } | { ok: false, error: string, code: string }}
 */
export async function subscribe(email, repo) {
	if (!email || !repo) {
		return {
			ok: false,
			code: SubscribeError.MISSING_FIELDS,
			error: "email and repo are required",
		};
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return {
			ok: false,
			code: SubscribeError.INVALID_EMAIL,
			error: "Invalid email address",
		};
	}
	if (!isValidRepoFormat(repo)) {
		return {
			ok: false,
			code: SubscribeError.INVALID_REPO_FORMAT,
			error: "Invalid repo format. Use owner/repo",
		};
	}

	try {
		const exists = await repoExists(repo);
		if (!exists) {
			return {
				ok: false,
				code: SubscribeError.REPO_NOT_FOUND,
				error: `Repository "${repo}" not found`,
			};
		}
	} catch (err) {
		if (err.status === 429) {
			return {
				ok: false,
				code: SubscribeError.RATE_LIMITED,
				error: "GitHub rate limit exceeded",
				retryAfter: err.retryAfter,
			};
		}
		return {
			ok: false,
			code: SubscribeError.INTERNAL,
			error: "Failed to verify repository",
		};
	}

	const confirmToken = uuidv4();
	const unsubscribeToken = uuidv4();

	try {
		insertSubscription(email, repo, confirmToken, unsubscribeToken);
	} catch (err) {
		if (err.message.includes("UNIQUE constraint failed")) {
			return {
				ok: false,
				code: SubscribeError.ALREADY_EXISTS,
				error: "Already subscribed to this repository",
			};
		}
		return { ok: false, code: SubscribeError.INTERNAL, error: "Database error" };
	}

	try {
		await sendConfirmationEmail({ email, repo, confirmToken });
	} catch (err) {
		console.error(
			"[SubscriptionService] Failed to send confirmation email:",
			err.message
		);
	}

	return {
		ok: true,
		message: "Subscription created. Check your email to confirm.",
	};
}

export const ConfirmError = Object.freeze({
	MISSING_TOKEN: "MISSING_TOKEN",
	NOT_FOUND: "NOT_FOUND",
});

/**
 * Confirms a subscription by token.
 * @returns {{ ok: true, message: string, alreadyConfirmed?: boolean } | { ok: false, error: string, code: string }}
 */
export function confirm(token) {
	if (!token) {
		return {
			ok: false,
			code: ConfirmError.MISSING_TOKEN,
			error: "Invalid token",
		};
	}

	const sub = findByConfirmToken(token);
	if (!sub) {
		return { ok: false, code: ConfirmError.NOT_FOUND, error: "Token not found" };
	}
	if (sub.confirmed) {
		return { ok: true, message: "Already confirmed", alreadyConfirmed: true };
	}

	confirmSubscription(token);
	return { ok: true, message: "Subscription confirmed successfully" };
}

export const UnsubscribeError = Object.freeze({
	MISSING_TOKEN: "MISSING_TOKEN",
	NOT_FOUND: "NOT_FOUND",
});

/**
 * Unsubscribes by token.
 * @returns {{ ok: true, message: string } | { ok: false, error: string, code: string }}
 */
export function unsubscribe(token) {
	if (!token) {
		return {
			ok: false,
			code: UnsubscribeError.MISSING_TOKEN,
			error: "Invalid token",
		};
	}

	const result = deleteByUnsubscribeToken(token);
	if (result.changes === 0) {
		return {
			ok: false,
			code: UnsubscribeError.NOT_FOUND,
			error: "Token not found",
		};
	}
	return { ok: true, message: "Unsubscribed successfully" };
}

export const GetSubscriptionsError = Object.freeze({
	INVALID_EMAIL: "INVALID_EMAIL",
});

/**
 * Returns all subscriptions for a given email.
 * @returns {{ ok: true, subscriptions: Array } | { ok: false, error: string, code: string }}
 */
export function getSubscriptions(email) {
	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return {
			ok: false,
			code: GetSubscriptionsError.INVALID_EMAIL,
			error: "Invalid email",
		};
	}

	const rows = findAllByEmail(email);
	return {
		ok: true,
		subscriptions: rows.map((r) => ({
			email: r.email,
			repo: r.repo,
			confirmed: r.confirmed === 1,
			last_seen_tag: r.last_seen_tag,
		})),
	};
}
