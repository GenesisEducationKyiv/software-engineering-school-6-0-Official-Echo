import { buildConfirmationEmail } from "../emails/confirmation.js";
import { buildReleaseEmail } from "../emails/release.js";

/**
 * Creates a notifier bound to the given transport.
 * @param {{ sendMail: Function }} transport
 * @returns {{ sendConfirmationEmail: Function, sendReleaseNotification: Function }}
 */
export function createNotifier(transport) {
	const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
	const FROM = process.env.SMTP_FROM || "noreply@github-notifier.dev";
	return {
		/**
		 * Sends a subscription confirmation email.
		 * @param {{ to: string; repo: string; confirmToken: string }} params
		 */
		async sendConfirmationEmail({ to, repo, confirmToken }) {
			const payload = buildConfirmationEmail({
				to,
				repo,
				confirmToken,
				baseUrl: BASE_URL,
			});
			console.log(payload);
			await transport.sendMail({ from: FROM, ...payload });
		},

		/**
		 * Sends a new-release notification email.
		 * @param {{ to: string; repo: string; tag: string; unsubscribeToken: string }} params
		 */
		async sendReleaseNotification({ to, repo, tag, unsubscribeToken }) {
			const payload = buildReleaseEmail({
				to,
				repo,
				tag,
				unsubscribeToken,
				baseUrl: BASE_URL,
			});
			await transport.sendMail({ from: FROM, ...payload });
		},
	};
}
