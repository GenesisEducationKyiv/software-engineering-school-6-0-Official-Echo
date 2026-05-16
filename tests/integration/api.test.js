import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("#src/services/github.js", () => ({
	repoExists: vi.fn().mockResolvedValue(true),
	getLatestRelease: vi.fn().mockResolvedValue("v1.0.0"),
}));

vi.mock("#src/services/notifier.js", () => ({
	sendConfirmationEmail: vi.fn().mockResolvedValue(undefined),
	sendReleaseNotification: vi.fn().mockResolvedValue(undefined),
}));

// disable redis
vi.mock("#src/services/cache.js", () => ({
	cacheGet: vi.fn().mockResolvedValue(null),
	cacheSet: vi.fn().mockResolvedValue(undefined),
	cacheDel: vi.fn().mockResolvedValue(undefined),
}));

// disable cron
vi.mock("node-cron", () => ({ schedule: vi.fn() }));

process.env.DB_PATH = ":memory:";
process.env.NODE_ENV = "test";

const { app, server } = await import("#src/index.js");
const { repoExists } = await import("#src/services/github.js");
const { sendConfirmationEmail } = await import("#src/services/notifier.js");

const api = request(app);

function subscribe(body, key) {
	const req = api.post("/api/subscribe").send(body);
	if (key) req.set("x-api-key", key);
	return req;
}

afterAll(() => server.close());

describe("GET /health", () => {
	test("returns 200 ok", async () => {
		const res = await api.get("/health");
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ status: "ok" });
	});
});

describe("API-key auth", () => {
	beforeAll(() => {
		process.env.API_KEY = "test-secret";
	});
	afterAll(() => {
		delete process.env.API_KEY;
	});

	test("401 when header is missing", async () => {
		const res = await api
			.post("/api/subscribe")
			.send({ email: "a@b.com", repo: "owner/repo" });
		expect(res.status).toBe(401);
		expect(res.body.code).toBe("MISSING_API_KEY");
	});

	test("403 when key is wrong", async () => {
		const res = await api
			.post("/api/subscribe")
			.set("x-api-key", "wrong")
			.send({ email: "a@b.com", repo: "owner/repo" });
		expect(res.status).toBe(403);
		expect(res.body.code).toBe("INVALID_API_KEY");
	});

	test("passes through with correct key", async () => {
		const res = await api
			.post("/api/subscribe")
			.set("x-api-key", "test-secret")
			.send({ email: "auth@example.com", repo: "owner/repo" });
		expect(res.status).toBe(200);
	});
});

describe("POST /api/subscribe", () => {
	beforeEach(() => {
		vi.mocked(repoExists).mockResolvedValue(true);
		vi.mocked(sendConfirmationEmail).mockResolvedValue(undefined);
	});

	test("400 on missing email", async () => {
		const res = await subscribe({ repo: "owner/repo" });
		expect(res.status).toBe(400);
		expect(res.body.code).toBeDefined();
	});

	test("400 on invalid email format", async () => {
		const res = await subscribe({ email: "not-an-email", repo: "owner/repo" });
		expect(res.status).toBe(400);
	});

	test("400 on missing repo", async () => {
		const res = await subscribe({ email: "user@example.com" });
		expect(res.status).toBe(400);
	});

	test("400 on invalid repo format", async () => {
		const res = await subscribe({ email: "user@example.com", repo: "no-slash" });
		expect(res.status).toBe(400);
	});

	test("404 when repo does not exist on GitHub", async () => {
		vi.mocked(repoExists).mockResolvedValue(false);
		const res = await subscribe({
			email: "user@example.com",
			repo: "ghost/missing",
		});
		expect(res.status).toBe(404);
		expect(res.body.code).toBe("REPO_NOT_FOUND");
	});

	test("200 and sends confirmation email for valid input", async () => {
		const res = await subscribe({
			email: "new@example.com",
			repo: "facebook/react",
		});
		expect(res.status).toBe(200);
		expect(res.body.message).toMatch(/confirm/i);
		expect(sendConfirmationEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				email: "new@example.com",
				repo: "facebook/react",
			})
		);
	});

	test("409 on duplicate subscription", async () => {
		const body = { email: "dup@example.com", repo: "owner/dup-repo" };
		await subscribe(body);
		const res = await subscribe(body);
		expect(res.status).toBe(409);
		expect(res.body.code).toBe("ALREADY_EXISTS");
	});
});

describe("GET /api/confirm/:token", () => {
	test("404 for unknown token", async () => {
		const res = await api.get("/api/confirm/unknown-token-xyz");
		expect(res.status).toBe(404);
		expect(res.body.code).toBe("NOT_FOUND");
	});

	test("200 and confirms a real token", async () => {
		vi.mocked(repoExists).mockResolvedValue(true);
		let capturedToken;
		vi.mocked(sendConfirmationEmail).mockImplementation(({ confirmToken }) => {
			capturedToken = confirmToken;
			return Promise.resolve();
		});

		await subscribe({
			email: "confirm-me@example.com",
			repo: "owner/confirm-repo",
		});

		const res = await api.get(`/api/confirm/${capturedToken}`);
		expect(res.status).toBe(200);
		expect(res.body.message).toMatch(/confirmed/i);
	});

	test("200 with alreadyConfirmed for a token confirmed twice", async () => {
		vi.mocked(repoExists).mockResolvedValue(true);
		let capturedToken;
		vi.mocked(sendConfirmationEmail).mockImplementation(({ confirmToken }) => {
			capturedToken = confirmToken;
			return Promise.resolve();
		});

		await subscribe({ email: "twice@example.com", repo: "owner/twice-repo" });
		await api.get(`/api/confirm/${capturedToken}`);
		const res = await api.get(`/api/confirm/${capturedToken}`);

		expect(res.status).toBe(200);
		expect(res.body.message).toMatch(/already/i);
	});
});

describe("GET /api/unsubscribe/:token", () => {
	test("404 for unknown token", async () => {
		const res = await api.get("/api/unsubscribe/no-such-token");
		expect(res.status).toBe(404);
		expect(res.body.code).toBe("NOT_FOUND");
	});

	test("200 removes the subscription", async () => {
		vi.mocked(repoExists).mockResolvedValue(true);
		let capturedUnsubToken;

		let capturedConfirmToken;
		vi.mocked(sendConfirmationEmail).mockImplementation(({ confirmToken }) => {
			capturedConfirmToken = confirmToken;
			return Promise.resolve();
		});

		await subscribe({ email: "unsub@example.com", repo: "owner/unsub-repo" });

		await api.get(`/api/confirm/${capturedConfirmToken}`);

		const { findAllByEmail, findByConfirmToken } =
			await import("#src/repositories/subscriptionRepository.js");
		const row = await findByConfirmToken(capturedConfirmToken);
		capturedUnsubToken = row?.unsubscribe_token;

		const res = await api.get(`/api/unsubscribe/${capturedUnsubToken}`);
		expect(res.status).toBe(200);
		expect(res.body.message).toMatch(/unsubscribed/i);

		const after = await findAllByEmail("unsub@example.com");
		expect(after).toHaveLength(0);
	});
});

describe("GET /api/subscriptions", () => {
	test("400 on missing email query", async () => {
		const res = await api.get("/api/subscriptions");
		expect(res.status).toBe(400);
	});

	test("400 on invalid email query", async () => {
		const res = await api.get("/api/subscriptions?email=not-email");
		expect(res.status).toBe(400);
	});

	test("200 with empty array for unknown email", async () => {
		const res = await api.get("/api/subscriptions?email=nobody@example.com");
		expect(res.status).toBe(200);
		expect(res.body).toEqual([]);
	});

	test("200 returns subscriptions with confirmed flag", async () => {
		vi.mocked(repoExists).mockResolvedValue(true);
		let capturedToken;
		vi.mocked(sendConfirmationEmail).mockImplementation(({ confirmToken }) => {
			capturedToken = confirmToken;
			return Promise.resolve();
		});

		await subscribe({ email: "list@example.com", repo: "owner/list-repo" });

		let res = await api.get("/api/subscriptions?email=list@example.com");
		expect(res.status).toBe(200);
		expect(res.body).toHaveLength(1);
		expect(res.body[0].confirmed).toBe(false);

		await api.get(`/api/confirm/${capturedToken}`);
		res = await api.get("/api/subscriptions?email=list@example.com");
		expect(res.body[0].confirmed).toBe(true);
	});
});

describe("GET /metrics", () => {
	test("returns prometheus text format", async () => {
		const res = await api.get("/metrics");
		expect(res.status).toBe(200);
		expect(res.headers["content-type"]).toMatch(/text\/plain/);
	});
});
