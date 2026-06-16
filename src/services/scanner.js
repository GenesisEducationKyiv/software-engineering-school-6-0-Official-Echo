import { schedule } from "node-cron";

import { RateLimitError } from "../errors/index.js";
import { logger } from "./logger.js";

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || "*/15 * * * *";

/**
 * Creates the release scanner with all infrastructure dependencies injected.
 *
 * @param {{
 *   githubService: { getLatestRelease: Function },
 *   notifier: { sendReleaseNotification: Function },
 *   repository: {
 *     findConfirmedRepos: Function,
 *     findConfirmedSubscribersByRepo: Function,
 *     updateLastSeenTag: Function,
 *   },
 *   metrics: {
 *     scannerRunsTotal: { inc: Function },
 *     scannerErrorsTotal: { inc: Function },
 *     notificationsSentTotal: { inc: Function },
 *   },
 * }} deps
 */
export function createScanner({ githubService, notifier, repository, metrics }) {
	/**
	 *
	 * @param {string} repo
	 * @returns
	 */
	async function checkRepo(repo) {
		const latestTag = await githubService.getLatestRelease(repo);
		if (!latestTag) return;

		const subscribers = await repository.findConfirmedSubscribersByRepo(repo);

		for (const sub of subscribers) {
			if (sub.last_seen_tag === null) {
				await repository.updateLastSeenTag(sub.id, latestTag);
				logger.info(
					{ repo, email: sub.email, tag: latestTag },
					"[Scanner] first check, stored tag"
				);
				continue;
			}

			if (sub.last_seen_tag === latestTag) continue;

			logger.info(
				{ repo, email: sub.email, tag: latestTag },
				"[Scanner] NEW release detected"
			);
			await repository.updateLastSeenTag(sub.id, latestTag);

			try {
				await notifier.sendReleaseNotification({
					to: sub.email,
					repo,
					tag: latestTag,
					unsubscribeToken: sub.unsubscribe_token,
				});
				metrics.notificationsSentTotal.inc();
			} catch (err) {
				logger.error(
					{ err, email: sub.email, repo },
					"[Scanner] Failed to send notification"
				);
			}
		}
	}

	async function scanAllRepos() {
		metrics.scannerRunsTotal.inc();

		const repos = await repository.findConfirmedRepos();
		logger.info({ repoCount: repos.length }, "[Scanner] Checking repos");

		for (const { repo } of repos) {
			try {
				await checkRepo(repo);
			} catch (err) {
				if (err instanceof RateLimitError) {
					logger.warn(
						{ retryAfter: err.retryAfter },
						"[Scanner] Rate limited. Stopping."
					);
					break;
				}
				metrics.scannerErrorsTotal.inc();
				logger.error({ err, repo }, "[Scanner] Error checking repo");
			}
		}
	}

	function start() {
		logger.info({ schedule: CRON_SCHEDULE }, "[Scanner] Starting");
		schedule(CRON_SCHEDULE, scanAllRepos);
		scanAllRepos().catch((err) =>
			logger.error({ err }, "[Scanner] Initial scan failed")
		);
	}

	return { start, scanAllRepos, checkRepo };
}
