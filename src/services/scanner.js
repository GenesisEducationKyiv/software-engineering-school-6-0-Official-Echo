const cron = require("node-cron");
const { getDb } = require("../db/database");
const { getLatestRelease } = require("./github");
const { sendReleaseNotification } = require("./notifier");
const { notificationsSentTotal, scannerRunsTotal } = require("./metrics");

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || "*/15 * * * *";

async function scanAllRepos() {
	scannerRunsTotal.inc();
	const db = getDb();

	const repos = db
		.prepare(`SELECT DISTINCT repo FROM subscriptions WHERE confirmed = 1`)
		.all();

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

	const subscribers = db
		.prepare(
			`SELECT id, email, unsubscribe_token, last_seen_tag
       FROM subscriptions
       WHERE repo = ? AND confirmed = 1`
		)
		.all(repo);

	for (const sub of subscribers) {
		if (sub.last_seen_tag === null) {
			db.prepare(
				`UPDATE subscriptions SET last_seen_tag = ? WHERE id = ?`
			).run(latestTag, sub.id);
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
		db.prepare(`UPDATE subscriptions SET last_seen_tag = ? WHERE id = ?`).run(
			latestTag,
			sub.id
		);

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
	cron.schedule(CRON_SCHEDULE, scanAllRepos);
	scanAllRepos().catch(console.error);
}

module.exports = { startScanner, scanAllRepos, checkRepo };
