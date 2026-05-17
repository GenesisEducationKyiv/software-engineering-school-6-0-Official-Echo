import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/unit/**/*.test.js", "tests/integration/**/*.test.js"],
		environment: "node",
		pool: "forks",
		testTimeout: 15_000,
		coverage: {
			provider: "v8",
			reporter: ["text", "lcov"],
			reportsDirectory: "./coverage",
		},
	},
});
