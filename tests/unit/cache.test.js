import { describe, expect, test } from "vitest";

describe("cache service (unit logic)", () => {
	function makeInMemoryCache() {
		const store = new Map();
		return {
			async get(key) {
				return store.has(key) ? store.get(key) : null;
			},
			async set(key, value) {
				store.set(key, value);
			},
			async del(key) {
				store.delete(key);
			},
			has(key) {
				return store.has(key);
			},
		};
	}

	test("returns null for missing key", async () => {
		const c = makeInMemoryCache();
		expect(await c.get("missing")).toBeNull();
	});

	test("set and get round-trip with JSON values", async () => {
		const c = makeInMemoryCache();
		await c.set("repo:exists:denoland/deno", JSON.stringify(true));
		const raw = await c.get("repo:exists:denoland/deno");
		expect(JSON.parse(raw)).toBe(true);
	});

	test("set and get round-trip with object values", async () => {
		const c = makeInMemoryCache();
		const val = { tag_name: "v1.2.3" };
		await c.set("repo:release:x/y", JSON.stringify(val));
		const raw = await c.get("repo:release:x/y");
		expect(JSON.parse(raw)).toEqual(val);
	});

	test("del removes the key", async () => {
		const c = makeInMemoryCache();
		await c.set("key", "value");
		expect(c.has("key")).toBe(true);
		await c.del("key");
		expect(c.has("key")).toBe(false);
		expect(await c.get("key")).toBeNull();
	});
});
