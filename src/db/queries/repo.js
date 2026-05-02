module.exports = {
	GET_CONFIRMED_REPOS:
		"SELECT DISTINCT repo FROM subscriptions WHERE confirmed = 1",
	GET_CONFIRMED_SUBSCRIBERS_BY_REPO: `SELECT id, email, unsubscribe_token, last_seen_tag
       FROM subscriptions
       WHERE repo = ? AND confirmed = 1`,
	UPDATE_SUB_LAST_SEEN_TAG_BY_ID: `UPDATE subscriptions SET last_seen_tag = ? WHERE id = ?`,
};
