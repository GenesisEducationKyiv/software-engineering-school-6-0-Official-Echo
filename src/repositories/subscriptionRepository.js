import { getDb } from "../db/database.js";
import {
	GET_CONFIRMED_REPOS,
	GET_CONFIRMED_SUBSCRIBERS_BY_REPO,
	UPDATE_SUB_LAST_SEEN_TAG_BY_ID,
} from "../db/queries/repo.js";
import {
	CONFIRM_SUBSCRIPTION_BY_TOKEN,
	DELETE_SUBSCRIPTION_BY_TOKEN,
	GET_SUBSCRIPTIONS_BY_EMAIL,
	INSERT_SUBSCRIPTION,
} from "../db/queries/subscription.js";

export function insertSubscription(email, repo, confirmToken, unsubscribeToken) {
	getDb()
		.prepare(INSERT_SUBSCRIPTION)
		.run(email, repo, confirmToken, unsubscribeToken);
}

export function findByConfirmToken(token) {
	return getDb().prepare(CONFIRM_SUBSCRIPTION_BY_TOKEN).get(token);
}

export function confirmSubscription(token) {
	getDb()
		.prepare("UPDATE subscriptions SET confirmed = 1 WHERE confirm_token = ?")
		.run(token);
}

export function deleteByUnsubscribeToken(token) {
	return getDb().prepare(DELETE_SUBSCRIPTION_BY_TOKEN).run(token);
}

export function findAllByEmail(email) {
	return getDb().prepare(GET_SUBSCRIPTIONS_BY_EMAIL).all(email);
}

export function findConfirmedRepos() {
	return getDb().prepare(GET_CONFIRMED_REPOS).all();
}

export function findConfirmedSubscribersByRepo(repo) {
	return getDb().prepare(GET_CONFIRMED_SUBSCRIBERS_BY_REPO).all(repo);
}

export function updateLastSeenTag(id, tag) {
	getDb().prepare(UPDATE_SUB_LAST_SEEN_TAG_BY_ID).run(tag, id);
}
