import { getKysely } from "./kysely.js";

/**
 * Runs schema migrations using Kysely.
 * Uses if not exists, so safe to call anytime.
 */
export async function runMigrations() {
	await getKysely()
		.schema.createTable("subscriptions")
		.ifNotExists()
		.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
		.addColumn("email", "text", (col) => col.notNull())
		.addColumn("repo", "text", (col) => col.notNull())
		.addColumn("confirmed", "integer", (col) => col.notNull().defaultTo(0))
		.addColumn("confirm_token", "text", (col) => col.notNull().unique())
		.addColumn("unsubscribe_token", "text", (col) => col.notNull().unique())
		.addColumn("last_seen_tag", "text")
		.addColumn("created_at", "text", (col) =>
			col.notNull().defaultTo("datetime('now')")
		)
		.addUniqueConstraint("unique_email_repo", ["email", "repo"])
		.execute();

	console.log("[DB] Migrations applied");
}
