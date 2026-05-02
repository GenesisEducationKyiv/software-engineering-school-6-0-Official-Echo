import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const TTL = 60 * 10;

let client = null;
let connected = false;

function getRedis() {
	if (!client) {
		client = new Redis(REDIS_URL, {
			lazyConnect: true,
			enableOfflineQueue: false,
			maxRetriesPerRequest: 1,
		});

		client.on("connect", () => {
			connected = true;
			console.log("[Redis] Connected");
		});
		client.on("error", (err) => {
			connected = false;
			console.warn("[Redis] Unavailable:", err.message);
		});

		client.connect().catch(() => {});
	}
	return client;
}

/**
 * Gets a cached value. Returns null if missing or Redis unavailable.
 */
async function cacheGet(key) {
	try {
		if (!connected) return null;
		const val = await getRedis().get(key);
		return val ? JSON.parse(val) : null;
	} catch (err) {
		console.warn("[Redis] cacheGet failed for key:", key, "-", err.message);
		return null;
	}
}

/**
 * Sets a value with TTL. Silently fails if Redis is unavailable.
 */
async function cacheSet(key, value) {
	try {
		if (!connected) return;
		await getRedis().set(key, JSON.stringify(value), "EX", TTL);
	} catch (err) {
		console.warn("[Redis] cacheSet failed for key:", key, "-", err.message);
	}
}

/**
 * Deletes a cached value. Silently fails if Redis is unavailable.
 */
async function cacheDel(key) {
	try {
		if (!connected) return;
		await getRedis().del(key);
	} catch (err) {
		console.warn("[Redis] cacheDel failed for key:", key, "-", err.message);
	}
}

export { getRedis, cacheGet, cacheSet, cacheDel };
