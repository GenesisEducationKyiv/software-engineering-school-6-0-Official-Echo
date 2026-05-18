import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/e2e",
	testMatch: "**/*.spec.js",
	timeout: 30_000,
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: process.env.CI ? "github" : "list",
	use: {
		baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
		screenshot: "only-on-failure",
		trace: "on-first-retry",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: process.env.E2E_BASE_URL
		? undefined
		: {
				command: "pnpm start",
				url: "http://localhost:3000",
				reuseExistingServer: !process.env.CI,
			},
});
