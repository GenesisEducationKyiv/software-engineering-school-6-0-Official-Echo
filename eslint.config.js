import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default defineConfig([
	{
		files: ["**/*.js"],
		extends: [js.configs.recommended],
		plugins: {
			js,
		},
		languageOptions: {
			globals: {
				...globals.node,
				...globals.vitest,
			},
		},
		rules: {
			"no-console": "off",
			"no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
		},
	},
	eslintConfigPrettier,
]);
