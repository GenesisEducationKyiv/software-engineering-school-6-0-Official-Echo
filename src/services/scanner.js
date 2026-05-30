import { schedule } from "node-cron";

import { RateLimitError } from "../errors/index.js";
import {
	findConfirmedRepos,
	findConfirmedSubscribersByRepo,
	updateLastSeenTag,
} from "../repositories/subscriptionRepository.js";
import { getLatestRelease } from "./github.js";
import { logger } from "./logger.js";
import { sendReleaseNotification } from "./notifier.js";

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || "*/15 * * * *";

export async function scanAllRepos() {
	scannerRunsTotal.inc();

	const repos = await findConfirmedRepos();
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
			logger.error({ err, repo }, "[Scanner] Error checking repo");
		}
	}
}
/**
 *
 * @param {string} repo
 */
export async function checkRepo(repo) {
	const latestTag = await getLatestRelease(repo);
	if (!latestTag) return;

	const subscribers = await findConfirmedSubscribersByRepo(repo);

	for (const sub of subscribers) {
		if (sub.last_seen_tag === null) {
			await updateLastSeenTag(sub.id, latestTag);
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
		await updateLastSeenTag(sub.id, latestTag);

		try {
			await sendReleaseNotification({
				email: sub.email,
				repo,
				tag: latestTag,
				unsubscribeToken: sub.unsubscribe_token,
			});
			notificationsSentTotal.inc();
		} catch (err) {
			logger.error(
				{ err, email: sub.email, repo },
				"[Scanner] Failed to send notification"
			);
		}
	}
}

export function startScanner() {
	logger.info({ schedule: CRON_SCHEDULE }, "[Scanner] Starting");
	schedule(CRON_SCHEDULE, scanAllRepos);
	scanAllRepos().catch(console.error);
}
