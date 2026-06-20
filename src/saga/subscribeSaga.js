import { logger } from "../services/logger.js";

/**
 * Subscription utilizing orchestrated saga pattern.
 *
 *   *Step 1* — Subscription Service: insert pending row into DB\
 *     Compensation: delete the row by confirmToken
 *
 *   *Step 2* — Notification Service: send confirmation email via notifier\
 *     Compensation: none needed (email already sent / not sent; idempotent)
 *
 * If *Step 2* fails the orchestrator executes *Step 1*'s compensation to keep running consistent
 *  to avoid having dangling pending rows without an email.
 *
 * @param {{
 *   email: string,
 *   repo: string,
 *   confirmToken: string,
 *   unsubscribeToken: string,
 *   repository: {
 *     insertSubscription: Function,
 *     deleteByConfirmToken: Function,
 *   },
 *   notifier: { sendConfirmationEmail: Function },
 * }} params
 * @returns {Promise<void>}
 * @throws re-throws the original error after compensation
 */
export async function runSubscribeSaga({
	email,
	repo,
	confirmToken,
	unsubscribeToken,
	repository,
	notifier,
}) {
	await repository.insertSubscription(email, repo, confirmToken, unsubscribeToken);

	try {
		await notifier.sendConfirmationEmail({ to: email, repo, confirmToken });
	} catch (emailErr) {
		logger.warn(
			{ err: emailErr, email, repo },
			"[SubscribeSaga] Email step failed — compensating: deleting subscription"
		);
		try {
			await repository.deleteByConfirmToken(confirmToken);
			logger.info({ email, repo }, "[SubscribeSaga] Compensation succeeded");
		} catch (compensationErr) {
			logger.error(
				{ err: compensationErr, email, repo, confirmToken },
				"[SubscribeSaga] Compensation failed, orphaned subscription now present"
			);
		}
		throw emailErr;
	}
}
