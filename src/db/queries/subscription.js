export const INSERT_SUBSCRIPTION = `
      INSERT INTO subscriptions (email, repo, confirm_token, unsubscribe_token)
      VALUES (?, ?, ?, ?)
    `;
export const CONFIRM_SUBSCRIPTION_BY_TOKEN =
	"SELECT * FROM subscriptions WHERE confirm_token = ?";
export const DELETE_SUBSCRIPTION_BY_TOKEN =
	"DELETE FROM subscriptions WHERE unsubscribe_token = ?";
export const GET_SUBSCRIPTIONS_BY_EMAIL = `
      SELECT email, repo, confirmed, last_seen_tag
      FROM subscriptions
      WHERE email = ?
      ORDER BY created_at DESC
    `;
