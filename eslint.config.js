import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";

export default defineConfig([
	{
		files: ["**/*.js"],
		extends: [js.configs.recommended],
		plugins: {
			js,
			simpleImportSort,
		},
		languageOptions: {
			globals: {
				...globals.node,
				...globals.vitest,
			},
			parserOptions: {
				sourceType: "module",
				ecmaVersion: "latest",
			},
		},
		rules: {
			// Possible problems
			"no-console": "off",
			"no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
			"no-use-before-define": [
				"error",
				{ functions: false, allowNamedExports: true },
			],
			"no-unreachable-loop": "error",
			"no-template-curly-in-string": "warn",

			// Suggestions
			"default-case-last": "error",
			"default-param-last": "error",
			"dot-notation": "warn",
			"grouped-accessor-pairs": ["warn", "getBeforeSet"],
			"new-cap": ["error", { capIsNew: false, properties: false }],
			"no-else-return": "error",
			eqeqeq: "error",
			"no-eval": "error",
			"no-implied-eval": "error",
			"no-extend-native": "error",
			"no-lone-blocks": "error",
			"no-lonely-if": "warn",
			"no-nested-ternary": "error",
			"no-new-func": "error",
			"no-new-wrappers": "warn",
			"no-plusplus": "error",
			"no-useless-computed-key": "warn",
			"no-var": "error",
			"operator-assignment": "warn",
			"prefer-const": ["warn", { destructuring: "all" }],
			"prefer-exponentiation-operator": "warn",
			"prefer-template": "warn",
			yoda: "error",

			"simpleImportSort/imports": "warn",
			"simpleImportSort/exports": "warn",
		},
	},
	eslintConfigPrettier,
]);
