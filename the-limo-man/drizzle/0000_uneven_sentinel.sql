CREATE TABLE `signup_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`bucket` integer NOT NULL,
	`count` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscribers` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`status` text DEFAULT 'subscribed' NOT NULL,
	`source` text NOT NULL,
	`consent_text` text NOT NULL,
	`subscribed_at` integer NOT NULL,
	`consent_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`signup_count` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscribers_email_unique` ON `subscribers` (`email`);--> statement-breakpoint
CREATE INDEX `subscribers_date_idx` ON `subscribers` (`subscribed_at`);