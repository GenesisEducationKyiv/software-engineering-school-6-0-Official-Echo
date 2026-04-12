const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../../data/app.db");

let db;

function getDb() {
	if (!db) {
		fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
		db = new Database(DB_PATH);
		db.pragma("journal_mode = WAL");
		db.pragma("foreign_keys = ON");
	}
	return db;
}

function runMigrations() {
	const database = getDb();

	database.exec(`
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
  `);

	console.log("[DB] Migrations applied");
}

function _resetDb() {
	if (db) {
		db.close();
		db = null;
	}
}

module.exports = { getDb, runMigrations, _resetDb };
