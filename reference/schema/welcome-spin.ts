import { pgTable, text, integer, serial, timestamp, boolean, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type { z } from "zod/v4";

export const spinCampaignsTable = pgTable("spin_campaigns", {
  id: text("id").primaryKey(),
  announcementUrl: text("announcement_url"),
  frozenAt: timestamp("frozen_at", { withTimezone: true }),
  active: boolean("active").notNull().default(false),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  shippingCountries: text("shipping_countries").array().notNull().default([]),
  instructions: text("instructions").notNull().default(""),
  sponsorContact: text("sponsor_contact").notNull().default(""),
  welcomeCopy: text("welcome_copy").notNull().default(""),
  entryTerms: text("entry_terms").notNull().default(""),
  shippingTerms: text("shipping_terms").notNull().default(""),
  freeDeliveryConfirmed: boolean("free_delivery_confirmed").notNull().default(false),
  fulfillmentConfirmed: boolean("fulfillment_confirmed").notNull().default(false),
  liveKeyConfirmed: boolean("live_key_confirmed").notNull().default(false),
  prizeVariants: jsonb("prize_variants").$type<Record<string, { id: string; description: string; valueCents?: number; designKey?: string; available?: boolean }[]>>().notNull().default({}),
  seedBonus: jsonb("seed_bonus").$type<{
    seedsPerEntry: number | null;
    perMemberCap: number | null;
    campaignCap: number | null;
    rulesVerified: boolean;
    enabled: boolean;
  }>().notNull().default({ seedsPerEntry: null, perMemberCap: null, campaignCap: null, rulesVerified: false, enabled: false }),
  launchApproved: boolean("launch_approved").notNull().default(false),
  rulesConfirmed: boolean("rules_confirmed").notNull().default(false),
  bundleImagePath: text("bundle_image_path"),
  bundleImageContentType: text("bundle_image_content_type"),
});

export const spinEntriesTable = pgTable("spin_entries", {
  id: serial("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => spinCampaignsTable.id),
  accountId: text("account_id").notNull(),
  email: text("email").notNull(),
  publicCode: text("public_code").unique(),
  entryKind: text("entry_kind").notNull().default("legacy"),
  reviewStatus: text("review_status").notNull().default("pending"),
  outcome: text("outcome").notNull(),
  prizeKey: text("prize_key"),
  prizeName: text("prize_name"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const promotionRepliesTable = pgTable("promotion_replies", {
  id: serial("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => spinCampaignsTable.id),
  accountId: text("account_id").notNull(),
  handle: text("handle").notNull(),
  url: text("url").notNull(),
  postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
  comment: text("comment").notNull(),
  status: text("status").notNull().default("pending"),
  ownerId: text("owner_id"),
  ownerReason: text("owner_reason"),
  verifiedPostedAt: timestamp("verified_posted_at", { withTimezone: true }),
  verifiedParentUrl: text("verified_parent_url"),
  verifiedComment: text("verified_comment"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("promotion_reply_url_unique").on(t.campaignId, t.url)]);

export const promotionDrawsTable = pgTable("promotion_draws", {
  campaignId: text("campaign_id").primaryKey().references(() => spinCampaignsTable.id),
  snapshotHash: text("snapshot_hash").notNull(),
  snapshotCount: integer("snapshot_count").notNull(),
  codeHashes: jsonb("code_hashes").$type<string[]>().notNull(),
  selected: jsonb("selected").$type<{ codeHash: string; prizeKey: string; maskedCode: string; entryId: number }[]>().notNull().default([]),
  algorithm: text("algorithm").notNull().default("crypto-random-int-fisher-yates-v1"),
  ownerId: text("owner_id").notNull(),
  frozenAt: timestamp("frozen_at", { withTimezone: true }).notNull().defaultNow(),
  drawnAt: timestamp("drawn_at", { withTimezone: true }),
});

export const promotionSeedAuditTable = pgTable("promotion_seed_audit", {
  id: serial("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => spinCampaignsTable.id),
  accountId: text("account_id").notNull(),
  entryId: integer("entry_id").notNull().references(() => spinEntriesTable.id),
  idempotencyKey: text("idempotency_key").notNull(),
  seedsSpent: integer("seeds_spent").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("promotion_seed_request_unique").on(t.campaignId, t.accountId, t.idempotencyKey)]);

export const spinClaimsTable = pgTable("spin_claims", {
  id: serial("id").primaryKey(),
  entryId: integer("entry_id").notNull().unique().references(() => spinEntriesTable.id),
  accountId: text("account_id").notNull(),
  email: text("email").notNull(),
  prizeKey: text("prize_key").notNull(),
  prizeName: text("prize_name").notNull(),
  imageUrl: text("image_url"),
  printifyProductId: integer("printify_product_id"),
  variants: jsonb("variants").$type<{ id: string; description: string; valueCents?: number; designKey?: string; available?: boolean }[]>().notNull(),
  shippingCountries: text("shipping_countries").array().notNull(),
  instructions: text("instructions").notNull().default(""),
  sponsorContact: text("sponsor_contact").notNull().default(""),
  shipping: jsonb("shipping").$type<{
    variantId: string; fullName: string; addressLine1: string; addressLine2?: string;
    city: string; region?: string; postalCode: string; countryCode: string;
    selections?: { designKey: string; optionId: string }[];
    shippingQuoteCents?: number; potifyContributionCents?: number;
    balanceCents?: number; orderReference?: string; fulfillmentStatus?: string;
  }>(),
  status: text("status").notNull().default("pending"),
  shareCode: text("share_code").unique(),
  receiptRevokedAt: timestamp("receipt_revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const spinClaimAuditTable = pgTable("spin_claim_audit", {
  id: serial("id").primaryKey(),
  claimId: integer("claim_id").notNull().references(() => spinClaimsTable.id),
  actorId: text("actor_id").notNull(),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  note: text("note").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const spinCampaignAuditTable = pgTable("spin_campaign_audit", {
  id: serial("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => spinCampaignsTable.id),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  before: jsonb("before").$type<Record<string, unknown> | null>(),
  after: jsonb("after").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSpinCampaignSchema = createInsertSchema(spinCampaignsTable);
export type InsertSpinCampaign = z.infer<typeof insertSpinCampaignSchema>;
export type SpinCampaignRow = typeof spinCampaignsTable.$inferSelect;
export const insertSpinEntrySchema = createInsertSchema(spinEntriesTable);
export type InsertSpinEntry = z.infer<typeof insertSpinEntrySchema>;
export type SpinEntryRow = typeof spinEntriesTable.$inferSelect;
export const insertSpinClaimSchema = createInsertSchema(spinClaimsTable);
export type InsertSpinClaim = z.infer<typeof insertSpinClaimSchema>;
export type SpinClaimRow = typeof spinClaimsTable.$inferSelect;
export const insertSpinClaimAuditSchema = createInsertSchema(spinClaimAuditTable);
export type InsertSpinClaimAudit = z.infer<typeof insertSpinClaimAuditSchema>;
export type SpinClaimAuditRow = typeof spinClaimAuditTable.$inferSelect;