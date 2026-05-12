import axios from "axios";
import { StatusCodes } from "http-status-codes";

import { RateLimitError } from "../errors/index.js";
import { cacheGet, cacheSet } from "./cache.js";

const githubClient = axios.create({
	baseURL: "https://api.github.com",
	headers: {
		Accept: "application/vnd.github+json",
		...(process.env.GITHUB_TOKEN
			? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
			: {}),
	},
	timeout: 10000,
});

function isValidRepoFormat(repo) {
	return /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo);
}

/**
 * Returns true if repo exists, false if 404.
 * Caches positive results for TTL.
 * @throws { RateLimitError }
 */
async function repoExists(repo) {
	const key = `repo:exists:${repo}`;
	const cached = await cacheGet(key);
	if (cached !== null) return cached;

	try {
		await githubClient.get(`/repos/${repo}`);
		await cacheSet(key, true);
		return true;
	} catch (err) {
		if (err.response?.status === StatusCodes.NOT_FOUND) {
			await cacheSet(key, false);
			return false;
		}
		if (err.response?.status === StatusCodes.TOO_MANY_REQUESTS) {
			throw new RateLimitError(
				"GitHub rate limit exceeded",
				"RATE_LIMITED",
				Number(err.response.headers["retry-after"]) || 60
			);
		}
		throw err;
	}
}

/**
 * Returns latest release tag or null.
 * Caches result for TTL.
 * @throws { RateLimitError }
 */
async function getLatestRelease(repo) {
	const key = `repo:release:${repo}`;
	const cached = await cacheGet(key);
	if (cached !== null) return cached;

	try {
		const res = await githubClient.get(`/repos/${repo}/releases/latest`);
		const tag = res.data.tag_name || null;
		await cacheSet(key, tag);
		return tag;
	} catch (err) {
		if (err.response?.status === StatusCodes.NOT_FOUND) return null;
		if (err.response?.status === StatusCodes.TOO_MANY_REQUESTS) {
			throw new RateLimitError(
				"GitHub rate limit exceeded",
				"RATE_LIMITED",
				Number(err.response.headers["retry-after"]) || 60
			);
		}
		throw err;
	}
}

export { getLatestRelease, isValidRepoFormat, repoExists };
