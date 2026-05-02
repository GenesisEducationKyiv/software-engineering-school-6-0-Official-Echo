export const CREATE_TABLE = `
    CREATE TABLE IF NOT EXISTS subscriptions (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      email             TEXT    NOT NULL,
      repo              TEXT    NOT NULL,
      confirmed         INTEGER NOT NULL DEFAULT 0,
      confirm_token     TEXT    NOT NULL UNIQUE,
      unsubscribe_token TEXT    NOT NULL UNIQUE,
      last_seen_tag     TEXT    DEFAULT NULL,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(email, repo)
    );
  `;
