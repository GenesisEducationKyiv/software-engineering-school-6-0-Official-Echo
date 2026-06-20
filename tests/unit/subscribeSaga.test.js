import { beforeEach, describe, expect, test, vi } from "vitest";

import { runSubscribeSaga } from "#src/saga/subscribeSaga.js";

function makeDeps(overrides = {}) {
	return {
		email: "user@example.com",
		repo: "owner/repo",
		confirmToken: "confirm-token-uuid",
		unsubscribeToken: "unsub-token-uuid",
		repository: {
			insertSubscription: vi.fn().mockResolvedValue(undefined),
			deleteByConfirmToken: vi.fn().mockResolvedValue({ changes: 1 }),
			...overrides.repository,
		},
		notifier: {
			sendConfirmationEmail: vi.fn().mockResolvedValue(undefined),
			...overrides.notifier,
		},
	};
}

describe("runSubscribeSaga()", () => {
	beforeEach(() => vi.clearAllMocks());

	describe("happy path", () => {
		test("calls insertSubscription with all four args", async () => {
			const deps = makeDeps();
			await runSubscribeSaga(deps);
			expect(deps.repository.insertSubscription).toHaveBeenCalledOnce();
			expect(deps.repository.insertSubscription).toHaveBeenCalledWith(
				"user@example.com",
				"owner/repo",
				"confirm-token-uuid",
				"unsub-token-uuid"
			);
		});

		test("calls sendConfirmationEmail with email, repo and confirmToken", async () => {
			const deps = makeDeps();
			await runSubscribeSaga(deps);
			expect(deps.notifier.sendConfirmationEmail).toHaveBeenCalledOnce();
			expect(deps.notifier.sendConfirmationEmail).toHaveBeenCalledWith({
				to: "user@example.com",
				repo: "owner/repo",
				confirmToken: "confirm-token-uuid",
			});
		});

		test("calls steps in order: insert before email", async () => {
			const order = [];
			const deps = makeDeps({
				repository: {
					insertSubscription: vi.fn().mockImplementation(async () => {
						order.push("insert");
					}),
				},
				notifier: {
					sendConfirmationEmail: vi.fn().mockImplementation(async () => {
						order.push("email");
					}),
				},
			});
			await runSubscribeSaga(deps);
			expect(order).toEqual(["insert", "email"]);
		});
	});

	describe("compensation", () => {
		test("deletes the subscription when email step fails", async () => {
			const deps = makeDeps({
				notifier: {
					sendConfirmationEmail: vi
						.fn()
						.mockRejectedValue(new Error("SMTP timeout")),
				},
			});
			await expect(runSubscribeSaga(deps)).rejects.toThrow("SMTP timeout");
			expect(deps.repository.deleteByConfirmToken).toHaveBeenCalledOnce();
			expect(deps.repository.deleteByConfirmToken).toHaveBeenCalledWith(
				"confirm-token-uuid"
			);
		});

		test("re-throws the original email error after compensation", async () => {
			const emailErr = new Error("SMTP timeout");
			const deps = makeDeps({
				notifier: {
					sendConfirmationEmail: vi.fn().mockRejectedValue(emailErr),
				},
			});
			await expect(runSubscribeSaga(deps)).rejects.toThrow(emailErr);
		});

		test("does not call compensation when insert step fails", async () => {
			const deps = makeDeps({
				repository: {
					insertSubscription: vi
						.fn()
						.mockRejectedValue(new Error("disk full")),
					deleteByConfirmToken: vi.fn(),
				},
			});
			await expect(runSubscribeSaga(deps)).rejects.toThrow("disk full");
			expect(deps.repository.deleteByConfirmToken).not.toHaveBeenCalled();
		});

		test("still re-throws email error when compensation itself fails", async () => {
			const emailErr = new Error("SMTP timeout");
			const deps = makeDeps({
				notifier: {
					sendConfirmationEmail: vi.fn().mockRejectedValue(emailErr),
				},
				repository: {
					deleteByConfirmToken: vi
						.fn()
						.mockRejectedValue(new Error("DB gone")),
				},
			});
			await expect(runSubscribeSaga(deps)).rejects.toThrow(emailErr);
		});
	});
});
