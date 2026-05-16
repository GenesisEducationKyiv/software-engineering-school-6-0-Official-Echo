import { z } from "zod";

export const subscribeSchema = z.object({
	email: z
		.string({ required_error: "Email is required" })
		.min(1, "Email is required")
		.email("Invalid email address"),
	repo: z
		.string({ required_error: "Repository is required" })
		.min(1, "Repository is required")
		.regex(
			/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/,
			"Invalid repo format. Use owner/repo"
		),
});

export const tokenSchema = z.object({
	token: z
		.string({ required_error: "Token is required" })
		.min(1, "Token is required"),
});

export const emailQuerySchema = z.object({
	email: z
		.string({ required_error: "Email is required" })
		.min(1, "Email is required")
		.email("Invalid email address"),
});
