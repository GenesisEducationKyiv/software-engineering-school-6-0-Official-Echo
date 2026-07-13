import { cruise } from "dependency-cruiser";
import { describe, expect, test } from "vitest";

describe("architecture: layer dependency rules", () => {
	test("src/, scanner-service/src/ and packages/common respect the documented layers", async () => {
		const { default: ruleSet } = await import("../../.dependency-cruiser.cjs");

		const { output } = await cruise(
			["src", "scanner-service/src", "packages/common"],
			ruleSet
		);

		const violations = output.summary.violations;

		if (violations.length > 0) {
			const details = violations
				.map(
					(v) =>
						`  [${v.rule.severity}] ${v.rule.name}: ${v.from} -> ${v.to}`
				)
				.join("\n");
			throw new Error(
				`Architecture rule violations found:\n${details}\n\n` +
					"See docs/ARCHITECTURE_LAYERS.md for the intended layering, " +
					"or run `pnpm arch:validate` locally for the full dependency-cruiser report."
			);
		}

		expect(violations).toHaveLength(0);
	});
});
