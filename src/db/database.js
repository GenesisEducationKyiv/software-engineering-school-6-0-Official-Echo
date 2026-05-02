const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const SQL = require("./queries/database.js");

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

	database.exec(SQL.CREATE_TABLE);

	console.log("[DB] Migrations applied");
}

function _resetDb() {
	if (db) {
		db.close();
		db = null;
	}
}

module.exports = { getDb, runMigrations, _resetDb };
