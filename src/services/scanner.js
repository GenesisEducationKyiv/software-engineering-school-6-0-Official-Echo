import { schedule } from "node-cron";

import { RateLimitError } from "../errors/index.js";
import {
	findConfirmedRepos,
	findConfirmedSubscribersByRepo,
	updateLastSeenTag,
} from "../repositories/subscriptionRepository.js";
import { getLatestRelease } from "./github.js";
import { notificationsSentTotal, scannerRunsTotal } from "./metrics.js";
import { sendReleaseNotification } from "./notifier.js";

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || "*/15 * * * *";

export async function scanAllRepos() {
	scannerRunsTotal.inc();

	const repos = findConfirmedRepos();
	console.log(`[Scanner] Checking ${repos.length} repo(s)...`);

	for (const { repo } of repos) {
		try {
			await checkRepo(repo);
		} catch (err) {
			if (err instanceof RateLimitError) {
				console.warn(
					`[Scanner] Rate limited. Retry after ${err.retryAfter}s. Stopping.`
				);
				break;
			}
			console.error(`[Scanner] Error checking ${repo}:`, err.message);
		}
	}
}

export async function checkRepo(repo) {
	const latestTag = await getLatestRelease(repo);
	if (!latestTag) return;

	const subscribers = findConfirmedSubscribersByRepo(repo);

	for (const sub of subscribers) {
		if (sub.last_seen_tag === null) {
			updateLastSeenTag(sub.id, latestTag);
			console.log(
				`[Scanner] ${repo} — ${sub.email}: first check, stored ${latestTag}`
			);
			continue;
		}

		if (sub.last_seen_tag === latestTag) {
			continue;
		}

		console.log(`[Scanner] ${repo} — ${sub.email}: NEW release ${latestTag}`);
		updateLastSeenTag(sub.id, latestTag);

		try {
			await sendReleaseNotification({
				email: sub.email,
				repo,
				tag: latestTag,
				unsubscribeToken: sub.unsubscribe_token,
			});
			notificationsSentTotal.inc();
		} catch (err) {
			console.error(
				`[Scanner] Failed to notify ${sub.email} for ${repo}:`,
				err.message
			);
		}
	}
}

export function startScanner() {
	console.log(`[Scanner] Starting, schedule: ${CRON_SCHEDULE}`);
	schedule(CRON_SCHEDULE, scanAllRepos);
	scanAllRepos().catch(console.error);
}
