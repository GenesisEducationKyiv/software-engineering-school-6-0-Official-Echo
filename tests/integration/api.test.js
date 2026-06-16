import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

// Infrastructure mocks — these are still concrete modules that the composition
// root (server.js) would normally wire. In integration tests we bypass server.js
// entirely and call buildApp() directly, so we only need to mock the two
// external I/O boundaries: GitHub API and SMTP.
const mockAxiosGet = vi.fn();

vi.mock("axios", () => {
	return {
		default: {
			create: vi.fn(() => ({
				get: mockAxiosGet,
			})),
		},
	};
});
vi.mock("node-cron", () => ({ schedule: vi.fn() }));

process.env.DB_PATH = ":memory:";
process.env.NODE_ENV = "test";

// Import the pieces we need to wire manually (same job as server.js, but for tests)
const { buildApp } = await import("#src/app.js");
const { runMigrations } = await import("#src/db/database.js");
const { createGithubService } = await import("#src/services/github.js");
const { createNotifier } = await import("#src/services/notifier.js");
const { createSubscriptionService } =
	await import("#src/services/subscriptionService.js");
const repository = await import("#src/repositories/subscriptionRepository.js");

// No-op cache — always misses, so github.js always goes to the mocked axios
const noopCache = {
	get: vi.fn().mockResolvedValue(null),
	set: vi.fn().mockResolvedValue(undefined),
};

// Controllable transport stub — tests can spy on sendMail calls
const transportStub = { sendMail: vi.fn().mockResolvedValue(undefined) };

// Build the real service graph with real in-memory SQLite, stubbed externals
const githubService = createGithubService(noopCache);
const notifier = createNotifier(transportStub);
const subscriptionService = createSubscriptionService({
	repository,
	githubService,
	notifier,
});

await runMigrations();

const app = buildApp(subscriptionService);
const server = app.listen(0); // port 0 = random, avoids conflicts
const api = request(app);

mockAxiosGet.mockResolvedValue({ data: {} });

beforeEach(() => {
	vi.clearAllMocks();
	mockAxiosGet.mockResolvedValue({ data: {} }); // default: repo exists
	transportStub.sendMail.mockResolvedValue(undefined);
});

afterAll(() => server.close());

function subscribe(body, key) {
	const req = api.post("/api/subscribe").send(body);
	if (key) req.set("x-api-key", key);
	return req;
}

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
		mockAxiosGet.mockRejectedValue({ response: { status: 404 } });
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
		expect(transportStub.sendMail).toHaveBeenCalledWith(
			expect.objectContaining({ to: "new@example.com" })
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
		let capturedToken;
		transportStub.sendMail.mockImplementation(({ html, text }) => {
			// Extract the token from the confirm URL in the email body
			const match = (html || text || "").match(/\/confirm\/([a-f0-9-]{36})/);
			if (match) capturedToken = match[1];
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
		let capturedToken;
		transportStub.sendMail.mockImplementation(({ html, text }) => {
			const match = (html || text || "").match(/\/confirm\/([a-f0-9-]{36})/);
			if (match) capturedToken = match[1];
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
		let capturedConfirmToken;
		transportStub.sendMail.mockImplementation(({ html, text }) => {
			const match = (html || text || "").match(/\/confirm\/([a-f0-9-]{36})/);
			if (match) capturedConfirmToken = match[1];
			return Promise.resolve();
		});

		await subscribe({ email: "unsub@example.com", repo: "owner/unsub-repo" });
		await api.get(`/api/confirm/${capturedConfirmToken}`);

		const row = await repository.findByConfirmToken(capturedConfirmToken);
		const capturedUnsubToken = row?.unsubscribe_token;

		const res = await api.get(`/api/unsubscribe/${capturedUnsubToken}`);
		expect(res.status).toBe(200);
		expect(res.body.message).toMatch(/unsubscribed/i);

		const after = await repository.findAllByEmail("unsub@example.com");
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
		let capturedToken;
		transportStub.sendMail.mockImplementation(({ html, text }) => {
			const match = (html || text || "").match(/\/confirm\/([a-f0-9-]{36})/);
			if (match) capturedToken = match[1];
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
