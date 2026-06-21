import axios from "axios";
import { StatusCodes } from "http-status-codes";

import { RateLimitError } from "../errors/index.js";

/**
 * Creates a GitHub API client bound to the given cache.
 *
 * @param {{ get: Function, set: Function }} cache
 * @returns {{ repoExists: Function, getLatestRelease: Function }}
 */
export function createGithubService(cache) {
	const client = axios.create({
		baseURL: "https://api.github.com",
		headers: {
			Accept: "application/vnd.github+json",
			...(process.env.GITHUB_TOKEN
				? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
				: {}),
		},
		timeout: 10000,
	});

	return {
		/**
		 * Returns true if repo exists on GitHub, false if 404.
		 * Caches positive and negative results for TTL.
		 * @param {string} repo
		 * @returns {Promise<boolean>}
		 * @throws {RateLimitError}
		 */
		async repoExists(repo) {
			const key = `repo:exists:${repo}`;
			const cached = await cache.get(key);
			if (cached !== null) return cached;

			try {
				await client.get(`/repos/${repo}`);
				await cache.set(key, true);
				return true;
			} catch (err) {
				if (err.response?.status === StatusCodes.NOT_FOUND) {
					await cache.set(key, false);
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
		},

		/**
		 * Returns the latest release tag string, or null if none exists.
		 * Caches the result for TTL.
		 * @param {string} repo
		 * @returns {Promise<string|null>}
		 * @throws {RateLimitError}
		 */
		async getLatestRelease(repo) {
			const key = `repo:release:${repo}`;
			const cached = await cache.get(key);
			if (cached !== null) return cached;

			try {
				const res = await client.get(`/repos/${repo}/releases/latest`);
				const tag = res.data.tag_name || null;
				await cache.set(key, tag);
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
		},
	};
}
