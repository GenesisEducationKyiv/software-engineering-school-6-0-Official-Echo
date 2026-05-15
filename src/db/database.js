import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname, join } from "path";

import { CREATE_TABLE } from "./queries/database.js";

const DB_PATH =
	process.env.DB_PATH || join(import.meta.dirname, "../../data/app.db");

let db;

export function getDb() {
	if (!db) {
		mkdirSync(dirname(DB_PATH), { recursive: true });
		db = new Database(DB_PATH);
		db.pragma("journal_mode = WAL");
		db.pragma("foreign_keys = ON");
	}
	return db;
}

export function runMigrations() {
	const database = getDb();

	database.exec(CREATE_TABLE);

	console.log("[DB] Migrations applied");
}

export function _resetDb() {
	if (db) {
		db.close();
		db = null;
	}
}
