CREATE TABLE `actions` (
	`id` text PRIMARY KEY NOT NULL,
	`decision_id` text NOT NULL,
	`journey_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'pending_approval' NOT NULL,
	`idempotency_key` text NOT NULL,
	`request` text NOT NULL,
	`result` text,
	`failure_reason` text,
	`approved_by` text,
	`approved_at` integer,
	`executed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`decision_id`) REFERENCES `decisions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `actions_idempotency_key_unique` ON `actions` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `actions_journey_id_idx` ON `actions` (`journey_id`);--> statement-breakpoint
CREATE INDEX `actions_decision_id_idx` ON `actions` (`decision_id`);--> statement-breakpoint
CREATE TABLE `audit_records` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`correlation_id` text NOT NULL,
	`stage` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`outcome` text NOT NULL,
	`summary` text NOT NULL,
	`payload` text NOT NULL,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `audit_records_journey_id_idx` ON `audit_records` (`journey_id`);--> statement-breakpoint
CREATE INDEX `audit_records_correlation_id_idx` ON `audit_records` (`correlation_id`);--> statement-breakpoint
CREATE TABLE `consents` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`channel` text NOT NULL,
	`purpose` text NOT NULL,
	`granted` integer NOT NULL,
	`source` text NOT NULL,
	`captured_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `consents_customer_channel_purpose_unique` ON `consents` (`customer_id`,`channel`,`purpose`);--> statement-breakpoint
CREATE TABLE `context_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`event_id` text NOT NULL,
	`nodes` text NOT NULL,
	`edges` text NOT NULL,
	`stale` integer DEFAULT false NOT NULL,
	`built_at` integer NOT NULL,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `context_snapshots_journey_id_idx` ON `context_snapshots` (`journey_id`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`loyalty_tier` text DEFAULT 'standard' NOT NULL,
	`loyalty_points` integer DEFAULT 0 NOT NULL,
	`preferences` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_email_unique` ON `customers` (`email`);--> statement-breakpoint
CREATE TABLE `decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`event_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`planner` text NOT NULL,
	`model` text,
	`prompt_version` text NOT NULL,
	`weights` text NOT NULL,
	`best_option` text NOT NULL,
	`alternatives` text NOT NULL,
	`confidence_basis_points` integer NOT NULL,
	`reasoning` text NOT NULL,
	`evidence` text NOT NULL,
	`trust_outcome` text NOT NULL,
	`trust_risk_score` integer NOT NULL,
	`trust_checks` text NOT NULL,
	`trust_risk_factors` text NOT NULL,
	`trust_policy_version` text NOT NULL,
	`trust_evaluated_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`snapshot_id`) REFERENCES `context_snapshots`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `decisions_journey_id_idx` ON `decisions` (`journey_id`);--> statement-breakpoint
CREATE INDEX `decisions_event_id_idx` ON `decisions` (`event_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`customer_id` text NOT NULL,
	`journey_id` text,
	`correlation_id` text NOT NULL,
	`severity` text DEFAULT 'medium' NOT NULL,
	`source` text NOT NULL,
	`payload` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`received_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_correlation_id_unique` ON `events` (`correlation_id`);--> statement-breakpoint
CREATE INDEX `events_journey_id_idx` ON `events` (`journey_id`);--> statement-breakpoint
CREATE INDEX `events_customer_id_idx` ON `events` (`customer_id`);--> statement-breakpoint
CREATE TABLE `journeys` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`template` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`goal` text NOT NULL,
	`context` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `journeys_customer_id_idx` ON `journeys` (`customer_id`);--> statement-breakpoint
CREATE INDEX `journeys_status_idx` ON `journeys` (`status`);