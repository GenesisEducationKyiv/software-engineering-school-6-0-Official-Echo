import { v4 as uuidv4 } from "uuid";

import { ConfirmError } from "../errors/constants/confirm.js";
import { SubscribeError } from "../errors/constants/subscribe.js";
import { UnsubscribeError } from "../errors/constants/unsubscribe.js";
import { ConflictError, NotFoundError, RateLimitError } from "../errors/index.js";
import {
	confirmSubscription,
	countSubscriptions,
} from "../repositories/subscriptionRepository.js";
import {
	validateConfirmToken,
	validateEmailQuery,
	validateSubscribeInput,
	validateUnsubscribeToken,
} from "../validation/index.js";
import { confirmedSubscriptionsTotal, subscriptionsTotal } from "./metrics.js";

async function refreshSubscriptionGauges() {
	const counts = await countSubscriptions();
	subscriptionsTotal.set(counts.total);
	confirmedSubscriptionsTotal.set(counts.confirmed);
}

/**
 * Creates the subscription service with all infrastructure dependencies injected.
 * @param {{repository: {
 *     insertSubscription: Function,
 *     findByConfirmToken: Function,
 *     confirmSubscription: Function,
 *     deleteByUnsubscribeToken: Function,
 *     findAllByEmail: Function,
 *   },
 *   githubService: {
 *     repoExists: Function,
 *   },
 *   notifier: {
 *     sendConfirmationEmail: Function,
 *   },
 * }} deps
 */
export function createSubscriptionService({ repository, githubService, notifier }) {
	return {
		/**
		 * Subscribes an email to repo release notifications.
		 * @param {string} email
		 * @param {string} repo
		 * @returns {Promise<{ ok: true, message: string }>}
		 * @throws {AppError}
		 */
		async subscribe(email, repo) {
			validateSubscribeInput({ email, repo });

			try {
				const exists = await githubService.repoExists(repo);
				if (!exists) {
					throw new NotFoundError(
						`Repository "${repo}" not found`,
						SubscribeError.REPO_NOT_FOUND
					);
				}
			} catch (err) {
				if (err instanceof NotFoundError) throw err;
				if (err instanceof RateLimitError) throw err;
				throw new Error(`Failed to verify repository: ${err.message}`, {
					cause: err,
				});
			}

			const confirmToken = uuidv4();
			const unsubscribeToken = uuidv4();

			try {
				await repository.insertSubscription(
					email,
					repo,
					confirmToken,
					unsubscribeToken
				);
			} catch (err) {
				if (err.message.includes("UNIQUE constraint failed")) {
					throw new ConflictError(
						"Already subscribed to this repository",
						SubscribeError.ALREADY_EXISTS
					);
				}
				throw new Error("Database error", { cause: err });
			}

			await notifier.sendConfirmationEmail({ to: email, repo, confirmToken });

			void refreshSubscriptionGauges();

			return {
				ok: true,
				message: "Subscription created. Check your email to confirm.",
			};
		},

		/**
		 * Confirms a subscription by token.
		 * @param {string} token
		 * @returns {Promise<{ ok: true, message: string, alreadyConfirmed?: boolean }>}
		 * @throws {AppError}
		 */
		async confirm(token) {
			validateConfirmToken({ token });

			const sub = await repository.findByConfirmToken(token);
			if (!sub) {
				throw new NotFoundError("Token not found", ConfirmError.NOT_FOUND);
			}

			if (sub.confirmed) {
				return {
					ok: true,
					message: "Already confirmed",
					alreadyConfirmed: true,
				};
			}

			await repository.confirmSubscription(token);
			void refreshSubscriptionGauges();
			return { ok: true, message: "Subscription confirmed successfully" };
		},

		/**
		 * Unsubscribes by token.
		 * @param {string} token
		 * @returns {Promise<{ ok: true, message: string }>}
		 * @throws {AppError}
		 */
		async unsubscribe(token) {
			validateUnsubscribeToken({ token });

			const result = await repository.deleteByUnsubscribeToken(token);
			if (result.changes === 0) {
				throw new NotFoundError(
					"Token not found",
					UnsubscribeError.NOT_FOUND
				);
			}

			return { ok: true, message: "Unsubscribed successfully" };
		},

		/**
		 * Returns all subscriptions for a given email.
		 * @param {string} email
		 * @returns {Promise<{ ok: true, subscriptions: Array }>}
		 * @throws {AppError}
		 */
		async getSubscriptions(email) {
			validateEmailQuery({ email });

			const rows = await repository.findAllByEmail(email);
			return {
				ok: true,
				subscriptions: rows.map((r) => ({
					email: r.email,
					repo: r.repo,
					confirmed: r.confirmed === 1,
					last_seen_tag: r.last_seen_tag,
				})),
			};
		},
	};
}
