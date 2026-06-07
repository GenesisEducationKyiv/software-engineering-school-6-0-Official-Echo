/**
 * Builds a release notification email payload.
 *
 * @param {{to: string;repo: string;tag: string;unsubscribeToken: string;baseUrl: string;}} params
 * @returns {{to: string;subject: string;text: string;html: string;}}
 */
export function buildReleaseEmail({ to, repo, tag, unsubscribeToken, baseUrl }) {
	const releaseUrl = `https://github.com/${repo}/releases/tag/${tag}`;
	const repoUrl = `https://github.com/${repo}`;
	const unsubscribeUrl = `${baseUrl}/api/unsubscribe/${unsubscribeToken}`;

	return {
		to,
		subject: `New release: ${repo} — ${tag}`,

		text: [
			`New release for ${repo}: ${tag}`,
			"",
			releaseUrl,
			"",
			`Unsubscribe: ${unsubscribeUrl}`,
		].join("\n"),

		html: `
	 <h2>
	   New release:
	   <a href="${repoUrl}">${repo}</a>
	 </h2>

	 <p>
	   Tag: <strong>${tag}</strong>
	 </p>

	 <p>
	   <a href="${releaseUrl}">
		 View on GitHub
	   </a>
	 </p>

	 <hr />

	 <small>
	   <a href="${unsubscribeUrl}">
		 Unsubscribe
	   </a>
	 </small>
   `,
	};
}
