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

export const repoQuerySchema = z.object({
	repo: z
		.string({ required_error: "Repository is required" })
		.min(1, "Repository is required")
		.regex(
			/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/,
			"Invalid repo format. Use owner/repo"
		),
});

export const updateLastSeenTagSchema = z.object({
	id: z.coerce
		.number({
			required_error: "Id is required",
			invalid_type_error: "Id must be a number",
		})
		.int("Id must be an integer")
		.positive("Id must be a positive integer"),
	tag: z.string({ required_error: "Tag is required" }).min(1, "Tag is required"),
});
