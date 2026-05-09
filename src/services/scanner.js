import { schedule } from "node-cron";

import { getDb } from "../db/database.js";
import {
	GET_CONFIRMED_REPOS,
	GET_CONFIRMED_SUBSCRIBERS_BY_REPO,
	UPDATE_SUB_LAST_SEEN_TAG_BY_ID,
} from "../db/queries/repo.js";
import { getLatestRelease } from "./github.js";
import { notificationsSentTotal, scannerRunsTotal } from "./metrics.js";
import { sendReleaseNotification } from "./notifier.js";

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || "*/15 * * * *";

async function scanAllRepos() {
	scannerRunsTotal.inc();
	const db = getDb();

	const repos = db.prepare(GET_CONFIRMED_REPOS).all();

	console.log(`[Scanner] Checking ${repos.length} repo(s)...`);

	for (const { repo } of repos) {
		try {
			await checkRepo(db, repo);
		} catch (err) {
			if (err.status === 429) {
				console.warn(
					`[Scanner] Rate limited. Retry after ${err.retryAfter}s. Stopping.`
				);
				break;
			}
			console.error(`[Scanner] Error checking ${repo}:`, err.message);
		}
	}

	console.log("[Scanner] Done.");
}

async function checkRepo(db, repo) {
	const latestTag = await getLatestRelease(repo);
	if (!latestTag) return;

	const subscribers = db.prepare(GET_CONFIRMED_SUBSCRIBERS_BY_REPO).all(repo);

	for (const sub of subscribers) {
		if (sub.last_seen_tag === null) {
			db.prepare(UPDATE_SUB_LAST_SEEN_TAG_BY_ID).run(latestTag, sub.id);
			console.log(
				`[Scanner] ${repo} — ${sub.email}: first check, stored ${latestTag}`
			);
			continue;
		}

		if (sub.last_seen_tag === latestTag) {
			console.log(`[Scanner] ${repo} — ${sub.email}: no new release`);
			continue;
		}

		console.log(`[Scanner] ${repo} — ${sub.email}: NEW release ${latestTag}`);
		db.prepare(UPDATE_SUB_LAST_SEEN_TAG_BY_ID).run(latestTag, sub.id);

		try {
			await sendReleaseNotification({
				email: sub.email,
				repo,
				tag: latestTag,
				unsubscribeToken: sub.unsubscribe_token,
			});
			notificationsSentTotal.inc();
			console.log(`[Scanner] Notified ${sub.email}`);
		} catch (err) {
			console.error(`[Scanner] Failed to notify ${sub.email}:`, err.message);
		}
	}
}

function startScanner() {
	console.log(`[Scanner] Starting, schedule: ${CRON_SCHEDULE}`);
	schedule(CRON_SCHEDULE, scanAllRepos);
	scanAllRepos().catch(console.error);
}

export { checkRepo, scanAllRepos, startScanner };
