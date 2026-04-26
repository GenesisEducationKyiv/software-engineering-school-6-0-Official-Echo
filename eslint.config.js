import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";

export default defineConfig([
	{
		files: ["**/*.js"],
		extends: ["js/recommended"],
		plugins: {
			js,
		},
		languageOptions: {
			globals: {
				...globals.node,
				...globals.jest,
			},
		},
		rules: {
			"no-console": "off",
			"no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
		},
	},
]);
