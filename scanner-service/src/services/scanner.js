import { schedule } from "node-cron";

import { RateLimitError } from "../errors/index.js";
import { EventType } from "../kafka/topics.js";
import { logger } from "./logger.js";

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || "*/15 * * * *";

export function createScanner({
	subscriptionClient,
	githubService,
	producer,
	metrics,
}) {
	async function checkRepo(repo) {
		const latestTag = await githubService.getLatestRelease(repo);
		if (!latestTag) return;

		const subscribers =
			await subscriptionClient.findConfirmedSubscribersByRepo(repo);

		for (const sub of subscribers) {
			if (sub.last_seen_tag === null) {
				await subscriptionClient.updateLastSeenTag(sub.id, latestTag);
				logger.info(
					{ repo, email: sub.email, tag: latestTag },
					"[Scanner] First check — stored tag"
				);
				continue;
			}
			if (sub.last_seen_tag === latestTag) continue;

			logger.info(
				{ repo, email: sub.email, tag: latestTag },
				"[Scanner] NEW release"
			);
			await subscriptionClient.updateLastSeenTag(sub.id, latestTag);
			await producer.publish(EventType.RELEASE_DETECTED, {
				email: sub.email,
				repo,
				tag: latestTag,
				unsubscribeToken: sub.unsubscribe_token,
			});
			metrics.notificationsSentTotal.inc();
		}
	}

	async function scanAllRepos() {
		metrics.scannerRunsTotal.inc();
		const repos = await subscriptionClient.findConfirmedRepos();
		logger.info({ repoCount: repos.length }, "[Scanner] Checking repos");

		for (const repo of repos) {
			try {
				await checkRepo(repo);
			} catch (err) {
				if (err instanceof RateLimitError) {
					logger.warn(
						{ retryAfter: err.retryAfter },
						"[Scanner] Rate limited — stopping cycle"
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
