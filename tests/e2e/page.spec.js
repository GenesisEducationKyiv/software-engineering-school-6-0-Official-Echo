import { expect, test } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";

/**
 * Intercept /api/subscribe and return a canned response.
 * @param {import('@playwright/test').Page} page
 * @param {object} body
 * @param {number} status
 */
async function mockSubscribe(page, body, status = 200) {
	await page.route("**/api/subscribe", (route) =>
		route.fulfill({
			status,
			contentType: "application/json",
			body: JSON.stringify(body),
		})
	);
}

/**
 * Intercept /api/subscriptions and return a list of subscription objects.
 * @param {import('@playwright/test').Page} page
 * @param {Array} subs
 */
async function mockSubscriptions(page, subs = []) {
	await page.route("**/api/subscriptions*", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(subs),
		})
	);
}

test("page loads with form elements visible", async ({ page }) => {
	await page.goto(BASE);

	await expect(page.locator("#email")).toBeVisible();
	await expect(page.locator("#repo")).toBeVisible();
	await expect(page.locator("#submitBtn")).toBeVisible();
	await expect(page.locator("#submitBtn")).toHaveText("Subscribe");
});

test("page title is GitHub Release Notifier", async ({ page }) => {
	await page.goto(BASE);
	await expect(page).toHaveTitle(/GitHub Release Notifier/i);
});

test("shows success message after successful subscription", async ({ page }) => {
	await mockSubscriptions(page, []);
	await mockSubscribe(page, {
		message: "Subscription created. Check your email to confirm.",
	});

	await page.goto(BASE);

	await page.fill("#email", "user@example.com");
	await page.fill("#repo", "facebook/react");
	await page.click("#submitBtn");

	await expect(page.locator("#message")).toHaveText(/check your email/i);
	await expect(page.locator("#message")).toHaveClass(/success/);
});

test("clears the repo field after successful subscription", async ({ page }) => {
	await mockSubscriptions(page, []);
	await mockSubscribe(page, {
		message: "Subscription created. Check your email to confirm.",
	});

	await page.goto(BASE);

	await page.fill("#email", "user@example.com");
	await page.fill("#repo", "facebook/react");
	await page.click("#submitBtn");

	await expect(page.locator("#message")).toHaveClass(/success/);
	await expect(page.locator("#repo")).toHaveValue("");
});

test("button is disabled during submission and re-enabled after", async ({
	page,
}) => {
	await page.route("**/api/subscribe", async (route) => {
		await new Promise((r) => setTimeout(r, 150));
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ message: "ok" }),
		});
	});
	await mockSubscriptions(page, []);

	await page.goto(BASE);

	await page.fill("#email", "user@example.com");
	await page.fill("#repo", "facebook/react");

	const clickPromise = page.click("#submitBtn");

	await expect(page.locator("#submitBtn")).toBeDisabled();

	await clickPromise;
	await expect(page.locator("#submitBtn")).toBeEnabled();
});

test("shows error message on 400 validation error", async ({ page }) => {
	await mockSubscribe(
		page,
		{ error: "Invalid email address", code: "MISSING_FIELDS" },
		400
	);

	await page.goto(BASE);

	await page.fill("#email", "user@example.com");
	await page.fill("#repo", "owner/repo");
	await page.click("#submitBtn");

	await expect(page.locator("#message")).toHaveClass(/error/);
	await expect(page.locator("#message")).toContainText(/invalid email/i);
});

test("shows error message on 404 repo not found", async ({ page }) => {
	await mockSubscribe(
		page,
		{ error: 'Repository "ghost/missing" not found', code: "REPO_NOT_FOUND" },
		404
	);

	await page.goto(BASE);

	await page.fill("#email", "user@example.com");
	await page.fill("#repo", "ghost/missing");
	await page.click("#submitBtn");

	await expect(page.locator("#message")).toHaveClass(/error/);
});

test("shows error message on 409 already subscribed", async ({ page }) => {
	await mockSubscribe(
		page,
		{ error: "Already subscribed to this repository", code: "ALREADY_EXISTS" },
		409
	);

	await page.goto(BASE);

	await page.fill("#email", "user@example.com");
	await page.fill("#repo", "owner/repo");
	await page.click("#submitBtn");

	await expect(page.locator("#message")).toHaveClass(/error/);
	await expect(page.locator("#message")).toContainText(/already subscribed/i);
});

test("shows network error message when fetch throws", async ({ page }) => {
	await page.route("**/api/subscribe", (route) => route.abort());

	await page.goto(BASE);

	await page.fill("#email", "user@example.com");
	await page.fill("#repo", "owner/repo");
	await page.click("#submitBtn");

	await expect(page.locator("#message")).toHaveClass(/error/);
	await expect(page.locator("#message")).toContainText(/network error/i);
});

test("loads and renders subscriptions list on email blur", async ({ page }) => {
	await mockSubscriptions(page, [
		{ repo: "facebook/react", confirmed: true, last_seen_tag: "v18.0.0" },
		{ repo: "vercel/next.js", confirmed: false, last_seen_tag: null },
	]);

	await page.goto(BASE);

	await page.fill("#email", "user@example.com");
	await page.locator("#email").dispatchEvent("blur");

	await expect(page.locator("#subList .sub-item")).toHaveCount(2);
	await expect(page.locator("#subList .sub-item").first()).toContainText(
		"facebook/react"
	);
	await expect(
		page.locator("#subList .sub-item").first().locator(".badge")
	).toHaveClass(/confirmed/);
	await expect(
		page.locator("#subList .sub-item").nth(1).locator(".badge")
	).toHaveClass(/pending/);
});

test("renders empty message when no subscriptions found", async ({ page }) => {
	await mockSubscriptions(page, []);

	await page.goto(BASE);

	await page.fill("#email", "nobody@example.com");
	await page.locator("#email").dispatchEvent("blur");

	await mockSubscribe(page, {
		message: "Subscription created. Check your email to confirm.",
	});
	await page.fill("#repo", "owner/repo");
	await page.click("#submitBtn");
	await expect(page.locator("#subList")).toContainText(/No subscriptions found/i);
});

test("refreshes subscription list after successful subscribe", async ({ page }) => {
	let callCount = 0;
	await page.route("**/api/subscriptions*", (route) => {
		callCount += 1;
		const subs =
			callCount === 1
				? []
				: [
						{
							repo: "facebook/react",
							confirmed: false,
							last_seen_tag: null,
						},
					];
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(subs),
		});
	});
	await mockSubscribe(page, {
		message: "Subscription created. Check your email to confirm.",
	});

	await page.goto(BASE);

	await page.fill("#email", "user@example.com");
	await page.fill("#repo", "facebook/react");
	await page.click("#submitBtn");

	await expect(page.locator("#subList .sub-item")).toHaveCount(1);
});

test("form is submittable via Enter key", async ({ page }) => {
	await mockSubscriptions(page, []);
	await mockSubscribe(page, {
		message: "Subscription created. Check your email to confirm.",
	});

	await page.goto(BASE);

	await page.fill("#email", "user@example.com");
	await page.fill("#repo", "facebook/react");
	await page.keyboard.press("Enter");

	await expect(page.locator("#message")).toHaveClass(/success/);
});
