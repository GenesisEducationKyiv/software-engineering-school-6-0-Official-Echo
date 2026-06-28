import Redis from "ioredis";

import { logger } from "./logger.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const TTL = 60 * 10;

/** @type {Redis} */
let redis;
let connected = false;

/**
 * Returns Redis instance with lazy connection by `REDIS_URL`.
 * Initializes it if it wasn't.
 * @returns {Redis}
 */
function getRedis() {
	if (!redis) {
		redis = new Redis(REDIS_URL, {
			lazyConnect: true,
			enableOfflineQueue: false,
		});
		redis.on("ready", () => {
			connected = true;
		});
		redis.on("error", () => {
			connected = false;
		});
		redis.connect().catch(() => {});
	}
	return redis;
}

getRedis();

/**
 * Gets a cached value by key. Returns null if unavailable or missing.
 * @param {string} key
 * @returns {Promise<string|null>}
 */
export async function cacheGet(key) {
	try {
		if (!connected) return null;
		const val = await getRedis().get(key);
		return val ? JSON.parse(val) : null;
	} catch (err) {
		logger.warn({ err, key }, "[Redis] cacheGet failed");
		return null;
	}
}

/**
 * Sets a cached value with a TTL. Silently fails if Redis is unavailable.
 * @param {string} key
 * @param {unknown} value
 */
export async function cacheSet(key, value) {
	try {
		if (!connected) return;
		await getRedis().set(key, JSON.stringify(value), "EX", TTL);
	} catch (err) {
		logger.warn({ err, key }, "[Redis] cacheSet failed");
	}
}

/**
 * Deletes a cached value. Silently fails if Redis is unavailable.
 * @param {string} key
 */
export async function cacheDel(key) {
	try {
		if (!connected) return;
		await getRedis().del(key);
	} catch (err) {
		logger.warn({ err, key }, "[Redis] cacheDel failed");
	}
}
