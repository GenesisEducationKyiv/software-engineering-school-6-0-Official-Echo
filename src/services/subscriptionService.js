import { v4 as uuidv4 } from "uuid";

import { ConfirmError } from "../errors/constants/confirm.js";
import { SubscribeError } from "../errors/constants/subscribe.js";
import { UnsubscribeError } from "../errors/constants/unsubscribe.js";
import { ConflictError, NotFoundError, RateLimitError } from "../errors/index.js";
import { EventType } from "../kafka/topics.js";
import { runSubscribeSaga } from "../saga/subscribeSaga.js";
import {
	validateConfirmToken,
	validateEmailQuery,
	validateSubscribeInput,
	validateUnsubscribeToken,
} from "../validation/index.js";
import { confirmedSubscriptionsTotal, subscriptionsTotal } from "./metrics.js";

/**
 * Creates the subscription service with all infrastructure dependencies injected.
 *
 * When a `producer` is provided the service publishes Kafka events for every
 * mutating operation for real-time notifications. Catches and suppresses errors
 * on inability to reach Kafka.
 *
 * @param {{
 *   repository: {
 *     insertSubscription: Function,
 *     findByConfirmToken: Function,
 *     confirmSubscription: Function,
 *     deleteByUnsubscribeToken: Function,
 *     findAllByEmail: Function,
 *     countSubscriptions: Function,
 *   },
 *   githubService: { repoExists: Function },
 *   notifier: { sendConfirmationEmail: Function },
 *   producer?: { publish: Function },
 * }} deps
 */
export function createSubscriptionService({
	repository,
	githubService,
	notifier,
	producer,
}) {
	async function refreshSubscriptionGauges() {
		const counts = await repository.countSubscriptions();
		subscriptionsTotal.set(counts.total);
		confirmedSubscriptionsTotal.set(counts.confirmed);
	}

	/**
	 * Publishes a Kafka event fire-and-forget.
	 * Catches and suppresses Kafka `publish` errors.
	 * @param {string} type
	 * @param {object} payload
	 */
	function publishEvent(type, payload) {
		if (!producer) return;
		void producer.publish(type, payload).catch(() => {});
	}

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
				await runSubscribeSaga({
					email,
					repo,
					confirmToken,
					unsubscribeToken,
					repository,
					notifier,
				});
			} catch (err) {
				if (err.message?.includes("UNIQUE constraint failed")) {
					throw new ConflictError(
						"Already subscribed to this repository",
						SubscribeError.ALREADY_EXISTS
					);
				}
				throw err;
			}

			publishEvent(EventType.SUBSCRIPTION_CREATED, { email, repo });

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

			publishEvent(EventType.SUBSCRIPTION_CONFIRMED, {
				email: sub.email,
				repo: sub.repo,
			});

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

			publishEvent(EventType.SUBSCRIPTION_DELETED, { token });

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
