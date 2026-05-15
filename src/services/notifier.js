import { createTransport as _createTransport } from "nodemailer";

function createTransport() {
	return _createTransport({
		host: process.env.SMTP_HOST || "smtp.ethereal.email",
		port: parseInt(process.env.SMTP_PORT || "587"),
		secure: process.env.SMTP_SECURE === "true",
		auth: {
			user: process.env.SMTP_USER,
			pass: process.env.SMTP_PASS,
		},
	});
}

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const FROM = process.env.SMTP_FROM || "noreply@github-notifier.dev";

/**
 * Sends a subscription confirmation email with a confirm link.
 */
export async function sendConfirmationEmail({ email, repo, confirmToken }) {
	const transport = createTransport();
	const confirmUrl = `${BASE_URL}/api/confirm/${confirmToken}`;

	await transport.sendMail({
		from: FROM,
		to: email,
		subject: `Confirm your subscription to ${repo} releases`,
		text: `Please confirm your subscription to ${repo} releases:\n\n${confirmUrl}`,
		html: `
      <h2>Confirm subscription</h2>
      <p>You requested to receive release notifications for <strong>${repo}</strong>.</p>
      <p><a href="${confirmUrl}">Click here to confirm</a></p>
      <p>If you didn't request this, ignore this email.</p>
    `,
	});
}

/**
 * Sends a new-release notification email.
 */
export async function sendReleaseNotification({
	email,
	repo,
	tag,
	unsubscribeToken,
}) {
	const transport = createTransport();
	const releaseUrl = `https://github.com/${repo}/releases/tag/${tag}`;
	const unsubUrl = `${BASE_URL}/api/unsubscribe/${unsubscribeToken}`;

	await transport.sendMail({
		from: FROM,
		to: email,
		subject: `New release: ${repo} — ${tag}`,
		text: `New release for ${repo}: ${tag}\n\n${releaseUrl}\n\nUnsubscribe: ${unsubUrl}`,
		html: `
      <h2>New release: <a href="https://github.com/${repo}">${repo}</a></h2>
      <p>Tag: <strong>${tag}</strong></p>
      <p><a href="${releaseUrl}">View on GitHub</a></p>
      <hr>
      <small><a href="${unsubUrl}">Unsubscribe</a></small>
    `,
	});
}
