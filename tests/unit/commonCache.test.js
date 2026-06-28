import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mockLogger = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };

function makeMockRedis() {
	const handlers = {};
	const instance = {
		on: vi.fn((event, cb) => {
			handlers[event] = cb;
			return instance;
		}),
		connect: vi.fn().mockResolvedValue(undefined),
		get: vi.fn(),
		set: vi.fn(),
		del: vi.fn(),
	};
	return { instance, handlers };
}

async function loadCacheModule() {
	const { instance: redis, handlers } = makeMockRedis();

	vi.doMock("ioredis", () => ({
		default: vi.fn(function () {
			return redis;
		}),
	}));
	vi.doMock("@ghchk/common/services/logger.js", () => ({ logger: mockLogger }));

	const { cacheGet, cacheSet, cacheDel } =
		await import("@ghchk/common/services/cache.js");

	return { cacheGet, cacheSet, cacheDel, redis, handlers };
}

describe("cache service — before Redis reports ready", () => {
	let mod;

	beforeEach(async () => {
		vi.resetModules();
		vi.clearAllMocks();
		mod = await loadCacheModule();
	});

	afterEach(() => {
		vi.doUnmock("ioredis");
		vi.doUnmock("@ghchk/common/services/logger.js");
	});

	test("connects eagerly on module load (not gated behind a call that never comes)", () => {
		expect(mod.redis.connect).toHaveBeenCalledOnce();
	});

	test("cacheGet returns null without touching Redis", async () => {
		expect(await mod.cacheGet("key")).toBeNull();
		expect(mod.redis.get).not.toHaveBeenCalled();
	});

	test("cacheSet is a no-op", async () => {
		await mod.cacheSet("key", "value");
		expect(mod.redis.set).not.toHaveBeenCalled();
	});

	test("cacheDel is a no-op", async () => {
		await mod.cacheDel("key");
		expect(mod.redis.del).not.toHaveBeenCalled();
	});
});

describe("cache service — connected", () => {
	let mod;

	beforeEach(async () => {
		vi.resetModules();
		vi.clearAllMocks();
		mod = await loadCacheModule();
		mod.handlers.ready();
	});

	afterEach(() => {
		vi.doUnmock("ioredis");
		vi.doUnmock("@ghchk/common/services/logger.js");
	});

	test("cacheGet returns the parsed value on a cache hit", async () => {
		mod.redis.get.mockResolvedValue(JSON.stringify({ tag_name: "v1.0.0" }));
		expect(await mod.cacheGet("repo:release:x/y")).toEqual({
			tag_name: "v1.0.0",
		});
		expect(mod.redis.get).toHaveBeenCalledWith("repo:release:x/y");
	});

	test("cacheGet returns null on a cache miss", async () => {
		mod.redis.get.mockResolvedValue(null);
		expect(await mod.cacheGet("missing")).toBeNull();
	});

	test("cacheGet returns null and logs a warning if Redis rejects", async () => {
		mod.redis.get.mockRejectedValue(new Error("timeout"));
		expect(await mod.cacheGet("key")).toBeNull();
		expect(mockLogger.warn).toHaveBeenCalledWith(
			expect.objectContaining({ key: "key" }),
			"[Redis] cacheGet failed"
		);
	});

	test("cacheSet writes the JSON-serialized value with a 10-minute TTL", async () => {
		mod.redis.set.mockResolvedValue("OK");
		await mod.cacheSet("key", { a: 1 });
		expect(mod.redis.set).toHaveBeenCalledWith(
			"key",
			JSON.stringify({ a: 1 }),
			"EX",
			600
		);
	});

	test("cacheSet swallows Redis errors and logs a warning", async () => {
		mod.redis.set.mockRejectedValue(new Error("timeout"));
		await expect(mod.cacheSet("key", "value")).resolves.toBeUndefined();
		expect(mockLogger.warn).toHaveBeenCalledWith(
			expect.objectContaining({ key: "key" }),
			"[Redis] cacheSet failed"
		);
	});

	test("cacheDel calls redis.del", async () => {
		mod.redis.del.mockResolvedValue(1);
		await mod.cacheDel("key");
		expect(mod.redis.del).toHaveBeenCalledWith("key");
	});

	test("cacheDel swallows Redis errors and logs a warning", async () => {
		mod.redis.del.mockRejectedValue(new Error("timeout"));
		await expect(mod.cacheDel("key")).resolves.toBeUndefined();
		expect(mockLogger.warn).toHaveBeenCalledWith(
			expect.objectContaining({ key: "key" }),
			"[Redis] cacheDel failed"
		);
	});

	test("reuses the same Redis client across calls (singleton)", async () => {
		const { default: Redis } = await import("ioredis");
		mod.redis.get.mockResolvedValue(null);
		await mod.cacheGet("a");
		await mod.cacheGet("b");
		expect(Redis).toHaveBeenCalledTimes(1);
	});
});

describe("cache service — connection lost after being ready", () => {
	let mod;

	beforeEach(async () => {
		vi.resetModules();
		vi.clearAllMocks();
		mod = await loadCacheModule();
		mod.handlers.ready();
	});

	afterEach(() => {
		vi.doUnmock("ioredis");
		vi.doUnmock("@ghchk/common/services/logger.js");
	});

	test("stops calling Redis once an error event flips connected back to false", async () => {
		mod.redis.get.mockResolvedValue(null);
		expect(await mod.cacheGet("x")).toBeNull();
		expect(mod.redis.get).toHaveBeenCalledTimes(1);

		mod.handlers.error(new Error("connection lost"));
		mod.redis.get.mockClear();

		expect(await mod.cacheGet("y")).toBeNull();
		expect(mod.redis.get).not.toHaveBeenCalled();
	});
});
