import { v4 as uuidv4 } from "uuid";

import { ConfirmError } from "../errors/constants/confirm.js";
import { GetSubscriptionsError } from "../errors/constants/getSubscriptions.js";
import { SubscribeError } from "../errors/constants/subscribe.js";
import { UnsubscribeError } from "../errors/constants/unsubscribe.js";
import {
	ConflictError,
	NotFoundError,
	RateLimitError,
	ValidationError,
} from "../errors/index.js";
import {
	confirmSubscription,
	deleteByUnsubscribeToken,
	findAllByEmail,
	findByConfirmToken,
	insertSubscription,
} from "../repositories/subscriptionRepository.js";
import { isValidRepoFormat, repoExists } from "./github.js";
import { sendConfirmationEmail } from "./notifier.js";

/**
 * Subscribes an email to repo release notifications.
 * @returns {{ ok: true, message: string }}
 * @throws { AppError }
 */
export async function subscribe(email, repo) {
	if (!email || !repo) {
		throw new ValidationError(
			"Email or repository missing",
			SubscribeError.MISSING_FIELDS
		);
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		throw new ValidationError(
			"Invalid email address",
			SubscribeError.INVALID_EMAIL
		);
	}
	if (!isValidRepoFormat(repo)) {
		throw new ValidationError(
			"Invalid repo format. Use owner/repo",
			SubscribeError.INVALID_REPO_FORMAT
		);
	}

	try {
		const exists = await repoExists(repo);
		if (!exists) {
			throw new NotFoundError(
				`Repository "${repo}" not found`,
				SubscribeError.REPO_NOT_FOUND
			);
		}
	} catch (err) {
		if (err instanceof NotFoundError) throw err;

		if (err instanceof RateLimitError) {
			throw new RateLimitError(
				"GitHub rate limit exceeded",
				SubscribeError.RATE_LIMITED
			);
		}

		throw new Error(`Failed to verify repository: ${err.message}`, {
			cause: err,
		});
	}

	const confirmToken = uuidv4();
	const unsubscribeToken = uuidv4();

	try {
		insertSubscription(email, repo, confirmToken, unsubscribeToken);
	} catch (err) {
		if (err.message.includes("UNIQUE constraint failed")) {
			throw new ConflictError(
				"Already subscribed to this repository",
				SubscribeError.ALREADY_EXISTS
			);
		}
		throw new Error("Database error", { cause: err });
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

/**
 * Confirms a subscription by token.
 * @returns {{ ok: true, message: string, alreadyConfirmed?: boolean }}
 * @throws { AppError }
 */
export function confirm(token) {
	if (!token) {
		throw new ValidationError("Invalid token", ConfirmError.MISSING_TOKEN);
	}

	const sub = findByConfirmToken(token);
	if (!sub) {
		throw new NotFoundError("Token not found", ConfirmError.NOT_FOUND);
	}

	if (sub.confirmed) {
		return { ok: true, message: "Already confirmed", alreadyConfirmed: true };
	}

	confirmSubscription(token);
	return { ok: true, message: "Subscription confirmed successfully" };
}

/**
 * Unsubscribes by token.
 * @returns {{ ok: true, message: string }}
 */
export function unsubscribe(token) {
	if (!token) {
		throw new ValidationError("Invalid token", UnsubscribeError.MISSING_TOKEN);
	}

	const result = deleteByUnsubscribeToken(token);
	if (result.changes === 0) {
		throw new NotFoundError("Token not found", UnsubscribeError.NOT_FOUND);
	}

	return { ok: true, message: "Unsubscribed successfully" };
}

/**
 * Returns all subscriptions for a given email.
 * @returns {{ ok: true, subscriptions: Array }}
 */
export function getSubscriptions(email) {
	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		throw new ValidationError(
			"Invalid email",
			GetSubscriptionsError.INVALID_EMAIL
		);
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
