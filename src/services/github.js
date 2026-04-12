const axios = require("axios");
const { cacheGet, cacheSet } = require("./cache");

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

function makeRateLimitError(headers = {}) {
	const e = new Error("GitHub API rate limit exceeded");
	e.status = 429;
	e.retryAfter = headers["retry-after"] || 60;
	return e;
}

/**
 * Returns true if repo exists, false if 404.
 * Caches positive results for TTL.
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
		if (err.response?.status === 404) {
			await cacheSet(key, false);
			return false;
		}
		if (err.response?.status === 429) {
			throw makeRateLimitError(err.response.headers);
		}
		throw err;
	}
}

/**
 * Returns latest release tag or null.
 * Caches result for TTL.
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
		if (err.response?.status === 404) return null;
		if (err.response?.status === 429) {
			throw makeRateLimitError(err.response.headers);
		}
		throw err;
	}
}

module.exports = { isValidRepoFormat, repoExists, getLatestRelease };
