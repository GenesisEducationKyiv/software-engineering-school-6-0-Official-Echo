import { getKysely } from "../db/kysely.js";

const db = () => getKysely();

/**
 * @param {string} email
 * @param {string} repo
 * @param {string} confirmToken
 * @param {string} unsubscribeToken
 */
export async function insertSubscription(
	email,
	repo,
	confirmToken,
	unsubscribeToken
) {
	await db()
		.insertInto("subscriptions")
		.values({
			email,
			repo,
			confirm_token: confirmToken,
			unsubscribe_token: unsubscribeToken,
		})
		.execute();
}

/**
 * @param {string} token
 * @returns {Promise<import("../db/kysely.js").SubscriptionTable|undefined>}
 */
export async function findByConfirmToken(token) {
	return db()
		.selectFrom("subscriptions")
		.selectAll()
		.where("confirm_token", "=", token)
		.executeTakeFirst();
}

/**
 * @param {string} token
 */
export async function confirmSubscription(token) {
	await db()
		.updateTable("subscriptions")
		.set({ confirmed: 1 })
		.where("confirm_token", "=", token)
		.execute();
}

/**
 * @param {string} token
 * @returns {Promise<{ changes: number }>}
 */
export async function deleteByUnsubscribeToken(token) {
	const result = await db()
		.deleteFrom("subscriptions")
		.where("unsubscribe_token", "=", token)
		.executeTakeFirst();
	return { changes: Number(result.numDeletedRows) };
}

/**
 * @param {string} email
 * @returns {Promise<{ email: string; repo: string; confirmed: number; last_seen_tag: string | null }[]>}
 */
export async function findAllByEmail(email) {
	return db()
		.selectFrom("subscriptions")
		.select(["email", "repo", "confirmed", "last_seen_tag"])
		.where("email", "=", email)
		.orderBy("created_at", "desc")
		.execute();
}

/**
 * @returns {Promise<{ repo: string }[]>}
 */
export async function findConfirmedRepos() {
	return db()
		.selectFrom("subscriptions")
		.select("repo")
		.distinct()
		.where("confirmed", "=", 1)
		.execute();
}

/**
 * @param {string} repo
 * @returns {Promise<{ id: number; email: string; unsubscribe_token: string; last_seen_tag: string | null }[]>}
 */
export async function findConfirmedSubscribersByRepo(repo) {
	return db()
		.selectFrom("subscriptions")
		.select(["id", "email", "unsubscribe_token", "last_seen_tag"])
		.where("repo", "=", repo)
		.where("confirmed", "=", 1)
		.execute();
}

/**
 * @param {number} id
 * @param {string} tag
 */
export async function updateLastSeenTag(id, tag) {
	await db()
		.updateTable("subscriptions")
		.set({ last_seen_tag: tag })
		.where("id", "=", id)
		.execute();
}
