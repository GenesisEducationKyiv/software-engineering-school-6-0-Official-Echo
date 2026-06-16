/**
 * Builds a subscription confirmation email payload.
 *
 * @param {{to: string; repo: string;confirmToken: string;baseUrl: string;}} params
 * @returns {{to: string;subject: string;text: string;html: string;}}
 */
export function buildConfirmationEmail({ to, repo, confirmToken, baseUrl }) {
	const confirmUrl = `${baseUrl}/api/confirm/${confirmToken}`;

	return {
		to,
		subject: `Confirm your subscription to ${repo} releases`,

		text: [
			`Please confirm your subscription to ${repo} releases.`,
			"",
			confirmUrl,
			"",
			"If you didn't request this, you can ignore this email.",
		].join("\n"),

		html: `
	 <h2>Confirm subscription</h2>

	 <p>
	   You requested to receive release notifications for
	   <strong>${repo}</strong>.
	 </p>

	 <p>
	   <a href="${confirmUrl}">
		 Click here to confirm
	   </a>
	 </p>

	 <p>If you didn't request this, ignore this email.</p>
   `,
	};
}
