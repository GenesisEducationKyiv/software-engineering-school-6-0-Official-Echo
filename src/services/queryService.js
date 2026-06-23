import {
	validateRepoQuery,
	validateUpdateLastSeenTag,
} from "../validation/index.js";

/**
 * Creates the query service — the read/update surface consumed by other
 * services (e.g. scanner-service) over gRPC. Wraps raw repository access
 * so that gRPC handlers delegate to a service layer instead of reaching
 * into the repository directly, mirroring how `subscriptionService`
 * fronts the mutating subscription operations.
 *
 * @param {{
 *   repository: {
 *     findConfirmedRepos: Function,
 *     findConfirmedSubscribersByRepo: Function,
 *     updateLastSeenTag: Function,
 *   }
 * }} deps
 */
export function createQueryService({ repository }) {
	return {
		/**
		 * Returns the distinct repos with at least one confirmed subscriber.
		 * @returns {Promise<{ ok: true, repos: string[] }>}
		 */
		async findConfirmedRepos() {
			const rows = await repository.findConfirmedRepos();
			return { ok: true, repos: rows.map((r) => r.repo) };
		},

		/**
		 * Returns confirmed subscribers for a given repo.
		 * @param {string} repo
		 * @returns {Promise<{ ok: true, subscribers: Array<{ id: number, email: string, unsubscribe_token: string, last_seen_tag: string|null }> }>}
		 * @throws {ValidationError}
		 */
		async findConfirmedSubscribersByRepo(repo) {
			validateRepoQuery({ repo });

			const rows = await repository.findConfirmedSubscribersByRepo(repo);
			return {
				ok: true,
				subscribers: rows.map((r) => ({
					id: r.id,
					email: r.email,
					unsubscribe_token: r.unsubscribe_token,
					last_seen_tag: r.last_seen_tag ?? null,
				})),
			};
		},

		/**
		 * Updates the last seen release tag for a subscription.
		 * @param {number|string} id
		 * @param {string} tag
		 * @returns {Promise<{ ok: true }>}
		 * @throws {ValidationError}
		 */
		async updateLastSeenTag(id, tag) {
			const parsed = validateUpdateLastSeenTag({ id, tag });

			await repository.updateLastSeenTag(parsed.id, parsed.tag);
			return { ok: true };
		},
	};
}
