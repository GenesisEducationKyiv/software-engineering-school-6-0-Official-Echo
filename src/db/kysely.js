//@ts-check
import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { Kysely, SqliteDialect } from "kysely";
import { dirname, join } from "path";

const DB_PATH =
	process.env.DB_PATH || join(import.meta.dirname, "../../data/app.db");

/**
 * @typedef {Object} SubscriptionTable
 * @property {number} id
 * @property {string} email
 * @property {string} repo
 * @property {number} confirmed
 * @property {string} confirm_token
 * @property {string} unsubscribe_token
 * @property {string|null} last_seen_tag
 * @property {string} created_at
 */

/**
 * @typedef {Object} DB
 * @property {SubscriptionTable} subscriptions
 */

/** @type {Kysely<DB>} */
let kyselyDb;

/**
 * Returns the singleton Kysely instance, creating it on first call.
 * @returns {Kysely<DB>}
 */
export function getKysely() {
	if (!kyselyDb) {
		mkdirSync(dirname(DB_PATH), { recursive: true });

		const sqlite = new Database(DB_PATH);
		sqlite.pragma("journal_mode = WAL");
		sqlite.pragma("foreign_keys = ON");

		kyselyDb = new Kysely({
			dialect: new SqliteDialect({ database: sqlite }),
		});
	}
	return kyselyDb;
}
