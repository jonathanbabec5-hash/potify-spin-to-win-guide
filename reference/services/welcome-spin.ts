import { randomBytes, randomInt } from "node:crypto";
import { db, spinCampaignsTable, spinEntriesTable, spinClaimsTable, spinClaimAuditTable, type SpinCampaignRow, type SpinClaimRow, type SpinEntryRow } from "@workspace/db";
import { and, eq, or, sql } from "drizzle-orm";
import { bundleImageUrl } from "./spin-bundle-image";

export const CAMPAIGN_ID = "welcome-spin-2026-10";
export function campaignIdFor(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit",
  }).formatToParts(now);
  const year = parts.find(p => p.type === "year")?.value;
  const month = parts.find(p => p.type === "month")?.value;
  if (!year || !month) throw new Error("Unable to determine campaign month");
  const activeMonth = `${year}-${month}`;
  // During September (and earlier) visitors preview the *approved upcoming*
  // October campaign; there is no September campaign or September entry.
  // At the November rollover, only explicitly owner-configured monthly rows
  // can open. This resolver is shared by public campaign, status and entry.
  return `welcome-spin-${activeMonth < "2026-10" ? "2026-10" : activeMonth}`;
}
export function validMonthlyCampaignId(id: string) {
  const match = /^welcome-spin-(20\d{2})-(0[1-9]|1[0-2])$/.exec(id);
  return !!match && `${match[1]}-${match[2]}` >= "2026-10";
}
export const PRODUCTION_SPIN_URL = "https://potifywebsite.com/spin";
const CAMPAIGN_START = new Date("2026-10-01T04:00:00.000Z");
const CAMPAIGN_END = new Date("2026-11-01T04:00:00.000Z");
const SPONSOR_CONTACT = "@potify_project";
export type PrizeVariant = { id: string; description: string; valueCents?: number; designKey?: string; available?: boolean };
const ENTRY_TERMS = `POTIFY October Welcome Spin. Sponsor: POTIFY. Contact: ${SPONSOR_CONTACT}. No purchase, payment, wallet, token, crypto transaction, or marketing consent required. Open October 1, 2026 at 12:00 a.m. through October 31, 2026 at 11:59 p.m., America/New_York (entry closes November 1 at 12:00 a.m. Eastern). 18+; where lawful; void where prohibited. One free entry per verified account in this monthly campaign. Before inventory is exhausted, each spin has a 1 in 400 chance of any prize: 1 in 1600 for each of the four prize types and 1596 in 1600 for no prize. Each prize type can be awarded only once in this month. The promotion closes to further entries immediately when any prize type is awarded; these odds apply only to spins accepted before closure, and prizes are not guaranteed. Winners must submit claims within 14 calendar days of winning. Winner can choose only an available size/finish of the awarded design of equal or lesser value than its awarded version; the set allows one eligible choice per design, each capped separately. No upgrades, cash, price difference, another design, or substitution. POTIFY pays standard US shipping. Worldwide destinations are subject to carrier availability, local restrictions, and customs/import charges. Outside the US, POTIFY contributes up to US $5 toward standard shipping; winner pays any remaining shipping via secure owner-managed invoice only, never via Telegram, crypto, or public receipt. Claim data is private to the winning account and authorized fulfillment staff; public receipts display prize and status only. Fraud, duplicate accounts, and automated entries may be disqualified after review. Virginia law governs to the extent permitted by applicable law.`;
const SHIPPING_TERMS = "Worldwide where carrier service and local law permit. POTIFY pays all standard US shipping. Outside the US, POTIFY contributes up to US $5 to standard shipping; the winner pays the remainder through owner-managed invoicing after a quote. Customs/import taxes and restrictions may apply. No payment is collected by this site, Telegram, crypto, or public receipt.";
const WELCOME_COPY = `Welcome to POTIFY, {first_name} 🌱 You’re part of the story now. Take one free welcome spin for a 1-in-400 chance to win one of our new stickers—or the full three-sticker set: ${PRODUCTION_SPIN_URL}. Then explore what we’re growing, play the game, and help shape what comes next. Seed → Soil → Solana. No purchase necessary; 18+, where lawful. Full rules: ${PRODUCTION_SPIN_URL}`;
// These numeric IDs identify public Printify storefront listings. They have not
// been verified as authenticated Printify API product IDs; no order is placed here.
// Mockup image URL variant segments are not approved fulfillment selections.
export const PRIZES = [
  { key: "astronaut", name: "Potify Astronaut Plant Sticker — Kiss-Cut Vinyl Decal", printifyProductId: 32371217, imageUrl: "https://images-api.printify.com/mockup/6ab64237cc33421cf40efd76/95745/79462/potify-astronaut-plant-sticker-kiss-cut-vinyl-decal.jpg?camera_label=front&revision=1790334021607" },
  { key: "seed-rider", name: "$POTIFY Seed Rider Vinyl Sticker", printifyProductId: 32370340, imageUrl: "https://images-api.printify.com/mockup/6ab64244f7ed56ecd700f08c/95743/79460/potify-seed-rider-vinyl-sticker.jpg?camera_label=front&revision=1790333197993" },
  { key: "rooted-builder", name: "Potify Rooted Builder  Sticker — Kiss-Cut Vinyl Decal", printifyProductId: 32370155, imageUrl: "https://images-api.printify.com/mockup/6ab636b9cbf1cb76a20b2767/95743/79460/potify-rooted-builder-sticker-kiss-cut-vinyl-decal.jpg?camera_label=front&revision=1790333953783" },
  { key: "sticker-bundle", name: "Complete three-sticker set", printifyProductId: null, imageUrl: null },
] as const;
const defaultVariants = Object.fromEntries(PRIZES.slice(0, 3).map(p =>
  [p.key, [{ id: "owner-review", description: "Winner's eligible size/finish, owner-reviewed manual fulfillment", valueCents: p.key === "astronaut" ? 999 : 499 }],
])) as Record<string, PrizeVariant[]>;

export const ODDS = Object.freeze({
  denominator: 1600, winningValuesPerPrize: 1, prizeCount: 4,
  totalWinningValues: 4, lossValues: 1596, spinsPerAccount: 1,
});

export function prizeForRoll(roll: number) {
  if (!Number.isInteger(roll) || roll < 0 || roll >= 1600) throw new RangeError("Invalid draw");
  return roll < 4 ? PRIZES[roll] : null;
}

export function missingSetup(row: SpinCampaignRow | undefined): string[] {
  const missing: string[] = [];
  if (!row?.startsAt || !row.endsAt || row.endsAt <= row.startsAt) missing.push("availability dates");
  if (!row?.instructions.trim()) missing.push("instructions");
  if (!row?.sponsorContact.trim()) missing.push("sponsor contact");
  if (!row?.freeDeliveryConfirmed) missing.push("free delivery confirmation");
  if (!row?.fulfillmentConfirmed) missing.push("manual fulfillment confirmation");
  if (!row?.welcomeCopy.includes(PRODUCTION_SPIN_URL)) missing.push("approved welcome copy and verified URL");
  if (!row?.entryTerms.trim()) missing.push("entry terms");
  if (!row?.shippingTerms.trim()) missing.push("shipping terms");
  if (!row?.rulesConfirmed) missing.push("owner-verified campaign rules");
  if (!row?.launchApproved) missing.push("explicit owner launch approval");
  for (const prize of PRIZES.slice(0, 3)) {
    if (!row?.prizeVariants[prize.key]?.length ||
      row.prizeVariants[prize.key][0]?.available === false ||
      row.prizeVariants[prize.key].some(v => !v.id.trim() || !v.description.trim() ||
        !Number.isSafeInteger(v.valueCents) || (v.valueCents ?? -1) < 0))
      missing.push(`${prize.name} awarded value/options`);
  }
  return missing;
}

export function isCampaignOpen(row: SpinCampaignRow | undefined, now = new Date()) {
  return !!row?.active && missingSetup(row).length === 0 &&
    !!row.startsAt && !!row.endsAt && row.startsAt <= now && now < row.endsAt;
}

export async function campaignRow(campaignId = campaignIdFor()) {
  if (!validMonthlyCampaignId(campaignId)) throw new Error("Invalid monthly campaign ID");
  // Only October has approved rules/schedule. Every subsequent month requires
  // explicit owner configuration and activation; no invented rolling approvals.
  if (campaignId === CAMPAIGN_ID) {
    await db.insert(spinCampaignsTable).values({
      id: CAMPAIGN_ID, active: false, startsAt: CAMPAIGN_START, endsAt: CAMPAIGN_END,
      shippingCountries: [], instructions: "Claim inside your verified account within 14 days. Owner confirms your eligible prize option and shipping quote before manual fulfillment.",
      sponsorContact: SPONSOR_CONTACT, freeDeliveryConfirmed: true,
      fulfillmentConfirmed: true, liveKeyConfirmed: true,
      welcomeCopy: WELCOME_COPY, entryTerms: ENTRY_TERMS, shippingTerms: SHIPPING_TERMS,
      prizeVariants: defaultVariants,
    }).onConflictDoNothing();
  }
  const [row] = await db.select().from(spinCampaignsTable).where(eq(spinCampaignsTable.id, campaignId));
  return row;
}

export function publicCampaign(row: SpinCampaignRow | undefined, requestedId = campaignIdFor()) {
  const now = new Date();
  const open = isCampaignOpen(row, now) && row?.id === campaignIdFor(now);
  const launchState = !row?.launchApproved || !row.rulesConfirmed
    ? "pending_owner_approval"
    : open ? "open"
    : row.active && row.startsAt && now < row.startsAt ? "scheduled" : "closed";
  return {
    campaignId: row?.id ?? requestedId,
    active: open,
    launchState,
    seedBonusActive: false, // No trusted earned-Seed redemption route exists.
    startsAt: row?.startsAt?.toISOString() ?? null,
    endsAt: row?.endsAt?.toISOString() ?? null,
    shippingCountries: row?.shippingCountries ?? [],
    entryTerms: row?.entryTerms ?? "",
    shippingTerms: row?.shippingTerms ?? "",
    instructions: row?.instructions ?? "",
    sponsorContact: row?.sponsorContact ?? "",
    prizes: PRIZES.map(p => ({
      ...p,
      imageUrl: p.key === "sticker-bundle" && row?.bundleImagePath
        ? bundleImageUrl(row.bundleImagePath) : p.imageUrl,
      variants: p.key === "sticker-bundle"
        ? bundleVariants(row)
        : row?.prizeVariants[p.key] ?? [],
    })),
    odds: ODDS,
    entryLimit: 1,
  };
}

function bundleVariants(row: SpinCampaignRow | undefined) {
  if (!row || PRIZES.slice(0, 3).some(p => !row.prizeVariants[p.key]?.length)) return [];
  return [{
    id: "bundle",
    description: PRIZES.slice(0, 3).map(p =>
      `${p.name}: ${row.prizeVariants[p.key][0].description} (up to $${((row.prizeVariants[p.key][0].valueCents ?? 0) / 100).toFixed(2)} per design)`,
    ).join("; "),
  }, ...PRIZES.slice(0, 3).flatMap(p => row.prizeVariants[p.key].map(v => ({
    ...v, id: `${p.key}:${v.id}`, designKey: p.key,
  })))];
}

export function publicClaim(claim: SpinClaimRow) {
  return {
    id: claim.id, prizeKey: claim.prizeKey, prizeName: claim.prizeName,
    imageUrl: claim.imageUrl, variants: claim.variants, shippingCountries: claim.shippingCountries,
    instructions: claim.instructions, sponsorContact: claim.sponsorContact,
    status: claim.status, shipping: claim.shipping && {
      variantId: claim.shipping.variantId, fullName: claim.shipping.fullName,
      addressLine1: claim.shipping.addressLine1, addressLine2: claim.shipping.addressLine2,
      city: claim.shipping.city, region: claim.shipping.region,
      postalCode: claim.shipping.postalCode, countryCode: claim.shipping.countryCode,
      selections: claim.shipping.selections, shippingQuoteCents: claim.shipping.shippingQuoteCents,
      potifyContributionCents: claim.shipping.potifyContributionCents,
      balanceCents: claim.shipping.balanceCents, fulfillmentStatus: claim.shipping.fulfillmentStatus,
    },
    shareCode: claim.receiptRevokedAt ? null : claim.shareCode,
    createdAt: claim.createdAt.toISOString(),
    updatedAt: claim.updatedAt.toISOString(),
  };
}

export function ownerClaim(claim: SpinClaimRow) {
  return {
    id: claim.id, accountId: claim.accountId, email: claim.email,
    prizeKey: claim.prizeKey, prizeName: claim.prizeName, status: claim.status,
    receiptRevoked: !!claim.receiptRevokedAt,
    variants: claim.variants, shippingCountries: claim.shippingCountries,
    instructions: claim.instructions, sponsorContact: claim.sponsorContact,
    shipping: claim.shipping, createdAt: claim.createdAt.toISOString(), updatedAt: claim.updatedAt.toISOString(),
  };
}

export async function getOwnResult(accountId: string, campaignId = campaignIdFor()) {
  const [entry] = await db.select().from(spinEntriesTable)
    .where(and(eq(spinEntriesTable.campaignId, campaignId), eq(spinEntriesTable.accountId, accountId)));
  if (!entry) return null;
  const [claim] = await db.select().from(spinClaimsTable).where(eq(spinClaimsTable.entryId, entry.id));
  return formatResult(entry, claim ? await ensureReceipt(claim, entry) : undefined);
}

function formatResult(entry: SpinEntryRow, claim?: SpinClaimRow) {
  return {
    outcome: entry.outcome, prizeKey: entry.prizeKey, prizeName: entry.prizeName,
    imageUrl: entry.imageUrl, claimId: claim?.id ?? null,
    claimStatus: claim?.status ?? null,
    shareCode: claim && !claim.receiptRevokedAt && entry.outcome === "win" && validMonthlyCampaignId(entry.campaignId)
      ? claim.shareCode : null,
    createdAt: entry.createdAt.toISOString(),
  };
}

export class SpinClosedError extends Error {}

// Legacy winning claims receive their code only on an authenticated owner read.
// The conditional update preserves a single stable code across concurrent requests.
export async function ensureReceipt(claim: SpinClaimRow, entry?: SpinEntryRow) {
  if (claim.shareCode || claim.receiptRevokedAt) return claim;
  const [win] = entry ? [entry] : await db.select().from(spinEntriesTable).where(eq(spinEntriesTable.id, claim.entryId));
  if (!win || win.id !== claim.entryId || win.outcome !== "win" ||
      !validMonthlyCampaignId(win.campaignId) || win.accountId !== claim.accountId) return claim;
  const [updated] = await db.update(spinClaimsTable)
    .set({ shareCode: randomBytes(32).toString("hex") })
    .where(and(eq(spinClaimsTable.id, claim.id), sql`${spinClaimsTable.shareCode} IS NULL`,
      sql`${spinClaimsTable.receiptRevokedAt} IS NULL`)).returning();
  if (updated) return updated;
  const [current] = await db.select().from(spinClaimsTable).where(eq(spinClaimsTable.id, claim.id));
  return current;
}

export async function findPublicReceipt(code: string) {
  if (!/^[a-f0-9]{64}$/.test(code)) return null;
  const [row] = await db.select({ claim: spinClaimsTable, entry: spinEntriesTable })
    .from(spinClaimsTable).innerJoin(spinEntriesTable, eq(spinClaimsTable.entryId, spinEntriesTable.id))
    .where(and(eq(spinClaimsTable.shareCode, code), sql`${spinClaimsTable.receiptRevokedAt} IS NULL`,
      or(sql`${spinEntriesTable.campaignId} LIKE 'welcome-spin-20__-__'`,
        eq(spinEntriesTable.campaignId, "welcome-promotion-2026")), eq(spinEntriesTable.outcome, "win")));
  if (!row || row.claim.accountId !== row.entry.accountId ||
      !(validMonthlyCampaignId(row.entry.campaignId) || row.entry.campaignId === "welcome-promotion-2026") ||
      !["pending", "submitted", "shipping_balance_required", "confirmed", "fulfilled"].includes(row.claim.status)) return null;
  const isPromotion = row.entry.campaignId === "welcome-promotion-2026";
  const wonAt = isPromotion ? row.claim.createdAt : row.entry.createdAt;
  const claimDeadline = claimDeadlineFor(wonAt);
  return {
    campaignId: row.entry.campaignId,
    prizeName: row.entry.prizeName ?? row.claim.prizeName,
    wonAt: wonAt.toISOString(),
    ...(isPromotion && row.entry.publicCode ? { maskedCode: `${row.entry.publicCode.slice(0, 5)}…${row.entry.publicCode.slice(-5)}` } : {}),
    status: row.claim.status,
    claimDeadline: claimDeadline.toISOString(),
    claimWindowOpen: row.claim.status === "pending" && new Date() < claimDeadline,
  };
}

export async function revokeReceipt(id: number) {
  const [claim] = await db.update(spinClaimsTable)
    .set({ receiptRevokedAt: new Date() })
    .where(and(eq(spinClaimsTable.id, id), sql`${spinClaimsTable.receiptRevokedAt} IS NULL`))
    .returning({ id: spinClaimsTable.id });
  if (claim) return true;
  const [existing] = await db.select({ id: spinClaimsTable.id })
    .from(spinClaimsTable).where(eq(spinClaimsTable.id, id));
  return !!existing;
}

// A transaction-scoped advisory lock serializes attempts by campaign/account even before
// either row exists. Unique constraints are a second line of defense. All failures rollback.
export async function enterSpin(accountId: string, email: string, draw: () => number = () => randomInt(1600)) {
  // draw is injectable only for isolated tests. HTTP callers never provide it,
  // and the default uses rejection-sampling cryptographic randomness.
  const campaignId = campaignIdFor();
  return db.transaction(async tx => {
    // Serialize every monthly entry globally: inventory cannot be exhausted by a
    // second concurrent draw, including on different app instances.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${campaignId + ":inventory"}, 0))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${campaignId + ":" + accountId}, 0))`);
    const [existing] = await tx.select().from(spinEntriesTable)
      .where(and(eq(spinEntriesTable.campaignId, campaignId), eq(spinEntriesTable.accountId, accountId)));
    if (existing) {
      let [claim] = await tx.select().from(spinClaimsTable).where(eq(spinClaimsTable.entryId, existing.id));
      if (claim && existing.outcome === "win" && !claim.shareCode && !claim.receiptRevokedAt &&
          claim.accountId === existing.accountId) {
        [claim] = await tx.update(spinClaimsTable).set({ shareCode: randomBytes(32).toString("hex") })
          .where(eq(spinClaimsTable.id, claim.id)).returning();
      }
      return { result: formatResult(existing, claim), created: false };
    }
    const [campaign] = await tx.select().from(spinCampaignsTable).where(eq(spinCampaignsTable.id, campaignId));
    if (!isCampaignOpen(campaign)) throw new SpinClosedError("Campaign is closed or setup is incomplete");
    const [awarded] = await tx.select({ id: spinEntriesTable.id }).from(spinEntriesTable)
      .where(and(eq(spinEntriesTable.campaignId, campaignId), eq(spinEntriesTable.outcome, "win"))).limit(1);
    if (awarded) throw new SpinClosedError("October prize inventory has been awarded; entries are closed");
    const prize = prizeForRoll(draw());
    const [entry] = await tx.insert(spinEntriesTable).values({
      campaignId, accountId, email,
      outcome: prize ? "win" : "loss",
       prizeKey: prize?.key ?? null, prizeName: prize?.name ?? null,
       imageUrl: prize?.key === "sticker-bundle" && campaign.bundleImagePath
         ? bundleImageUrl(campaign.bundleImagePath) : prize?.imageUrl ?? null,
    }).returning();
    let claim: SpinClaimRow | undefined;
    if (prize) {
      [claim] = await tx.insert(spinClaimsTable).values({
        entryId: entry.id, accountId, email, prizeKey: prize.key, prizeName: prize.name,
         imageUrl: prize.key === "sticker-bundle" && campaign.bundleImagePath
           ? bundleImageUrl(campaign.bundleImagePath) : prize.imageUrl,
        variants: prize.key === "sticker-bundle"
          ? bundleVariants(campaign)
          : campaign.prizeVariants[prize.key],
        shippingCountries: campaign.shippingCountries,
        instructions: campaign.instructions, sponsorContact: campaign.sponsorContact,
         shareCode: randomBytes(32).toString("hex"),
      }).returning();
      // Four equal outcomes retain 1/1600 probability *for every accepted entry*.
      // Close on first award; never offer a draw with exhausted winning inventory.
      await tx.update(spinCampaignsTable).set({ active: false })
        .where(eq(spinCampaignsTable.id, campaignId));
    }
    return { result: formatResult(entry, claim), created: true };
  });
}

export async function findOwnClaim(accountId: string, campaignId?: string) {
  if (campaignId && !validMonthlyCampaignId(campaignId)) return undefined;
  const [claim] = await db.select().from(spinClaimsTable)
    .innerJoin(spinEntriesTable, eq(spinEntriesTable.id, spinClaimsTable.entryId))
    .where(campaignId
      ? and(eq(spinClaimsTable.accountId, accountId), eq(spinEntriesTable.campaignId, campaignId))
      : eq(spinClaimsTable.accountId, accountId))
    .orderBy(sql`${spinClaimsTable.id} DESC`);
  return claim ? ensureReceipt(claim.spin_claims) : undefined;
}

export async function updateOwnClaim(accountId: string, shipping: NonNullable<SpinClaimRow["shipping"]>, claimId?: number) {
  return db.transaction(async tx => {
    const [claim] = await tx.select().from(spinClaimsTable)
      .where(claimId
        ? and(eq(spinClaimsTable.accountId, accountId), eq(spinClaimsTable.id, claimId))
        : eq(spinClaimsTable.accountId, accountId))
      .orderBy(sql`${spinClaimsTable.id} DESC`).for("update");
    if (!claim) return { error: "not-found" as const };
    if (claim.status !== "pending") return { error: "locked" as const };
    const [entry] = await tx.select().from(spinEntriesTable).where(eq(spinEntriesTable.id, claim.entryId));
    // Promotion codes are issued before the draw. The claim clock starts when
    // the winning claim is created at the draw, not on entry-code issue.
    if (!entry || !claimWithinDeadline(entry.campaignId === "welcome-promotion-2026" ? claim.createdAt : entry.createdAt)) return { error: "expired" as const };
    if (claim.shippingCountries.length && !claim.shippingCountries.includes(shipping.countryCode)) return { error: "country" as const };
    if (claim.prizeKey === "sticker-bundle" ? shipping.variantId !== "bundle"
      : !claim.variants.some(v => v.id === shipping.variantId)) return { error: "variant" as const };
    if (shipping.selections?.length) {
      const [campaign] = await tx.select().from(spinCampaignsTable)
        .where(eq(spinCampaignsTable.id, entry.campaignId));
      if (!campaign || !eligibleSelections(claim, campaign, shipping.selections))
        return { error: "variant" as const };
    }
    const [updated] = await tx.update(spinClaimsTable).set({
      shipping, status: "submitted", updatedAt: new Date(),
    }).where(eq(spinClaimsTable.id, claim.id)).returning();
    await tx.insert(spinClaimAuditTable).values({
      claimId: claim.id, actorId: accountId, fromStatus: claim.status,
      toStatus: "submitted", note: "Shipping information submitted by winner",
    });
    return { claim: updated };
  });
}

function eligibleSelections(
  claim: SpinClaimRow, campaign: SpinCampaignRow,
  choices: { designKey: string; optionId: string }[],
) {
  const designs: readonly string[] = claim.prizeKey === "sticker-bundle"
    ? PRIZES.slice(0, 3).map(p => p.key) : [claim.prizeKey];
  return choices.length === designs.length &&
    new Set(choices.map(c => c.designKey)).size === designs.length &&
    choices.every(c => {
      if (!designs.includes(c.designKey)) return false;
      const available = campaign.prizeVariants[c.designKey];
      const cap = claim.prizeKey === "sticker-bundle"
        ? claim.variants.find(v => v.designKey === c.designKey)?.valueCents
        : claim.variants[0]?.valueCents;
      const current = available?.find(v => v.id === c.optionId);
      const awarded = claim.prizeKey === "sticker-bundle"
        ? claim.variants.find(v => v.designKey === c.designKey && v.id === `${c.designKey}:${c.optionId}`)
        : claim.variants.find(v => v.id === c.optionId);
      const selected = current ?? awarded;
      return !!selected && Number.isSafeInteger(cap) &&
        current?.available !== false &&
        Number.isSafeInteger(selected.valueCents) &&
        selected.valueCents! <= cap! &&
        (!selected.designKey || selected.designKey === c.designKey);
    });
}

export function claimDeadlineFor(wonAt: Date): Date {
  const local = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(wonAt);
  const part = (name: string) => Number(local.find(p => p.type === name)?.value);
  const localEndDay = new Date(Date.UTC(part("year"), part("month") - 1, part("day") + 15));
  const year = localEndDay.getUTCFullYear(), month = localEndDay.getUTCMonth() + 1, day = localEndDay.getUTCDate();
  const probe = new Date(Date.UTC(year, month - 1, day, 18));
  const tz = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York",
    timeZoneName: "shortOffset" }).formatToParts(probe).find(p => p.type === "timeZoneName")?.value ?? "";
  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(tz);
  if (!match) throw new Error("Unable to determine claim timezone offset");
  const offsetMinutes = (match[1] === "+" ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3] ?? 0));
  return new Date(Date.UTC(year, month - 1, day) - offsetMinutes * 60_000);
}

export function claimWithinDeadline(wonAt: Date, now = new Date()): boolean {
  return now < claimDeadlineFor(wonAt);
}

export async function transitionClaim(
  id: number, actorId: string, status: "shipping_balance_required" | "confirmed" | "fulfilled",
  note: string, fulfillment?: {
    selections?: { designKey: string; optionId: string }[];
    shippingQuoteCents?: number; orderReference?: string;
  },
) {
  return db.transaction(async tx => {
    const [claim] = await tx.select().from(spinClaimsTable).where(eq(spinClaimsTable.id, id)).for("update");
    if (!claim) return { error: "not-found" as const };
    if ((status === "fulfilled" && claim.status !== "confirmed") ||
        (status === "confirmed" && !["submitted", "shipping_balance_required"].includes(claim.status)) ||
        (status === "shipping_balance_required" && claim.status !== "submitted") ||
        !claim.shipping) return { error: "transition" as const };
    const [entry] = await tx.select().from(spinEntriesTable).where(eq(spinEntriesTable.id, claim.entryId));
    if (!entry) return { error: "not-found" as const };
    const [campaign] = await tx.select().from(spinCampaignsTable).where(eq(spinCampaignsTable.id, entry.campaignId));
    if (!campaign) return { error: "not-found" as const };
    const designs: readonly string[] = claim.prizeKey === "sticker-bundle"
      ? PRIZES.slice(0, 3).map(p => p.key) : [claim.prizeKey];
    const choices = fulfillment?.selections ?? claim.shipping.selections ??
      designs.map(designKey => ({ designKey, optionId: campaign.prizeVariants[designKey]?.[0]?.id ?? "" }));
    if (claim.shipping.selections?.length && fulfillment?.selections &&
        JSON.stringify([...choices].sort((a,b) => a.designKey.localeCompare(b.designKey))) !==
        JSON.stringify([...claim.shipping.selections].sort((a,b) => a.designKey.localeCompare(b.designKey))))
      return { error: "variant" as const };
    if (status !== "fulfilled" && !eligibleSelections(claim, campaign, choices))
      return { error: "variant" as const };
    const quote = fulfillment?.shippingQuoteCents ?? claim.shipping.shippingQuoteCents;
    if (status !== "fulfilled" && (!Number.isSafeInteger(quote) || quote! < 0 || quote! > 10_000_000))
      return { error: "quote" as const };
    const contribution = claim.shipping.countryCode === "US" ? quote! : Math.min(500, quote!);
    const balance = quote! - contribution;
    if (status === "shipping_balance_required" && balance === 0) return { error: "transition" as const };
    if (status === "confirmed" && balance > 0 && claim.status !== "shipping_balance_required")
      return { error: "balance" as const };
    const orderReference = fulfillment?.orderReference ?? claim.shipping.orderReference;
    if (status === "fulfilled" && !orderReference?.trim()) return { error: "order-reference" as const };
    const shipping = { ...claim.shipping, selections: choices,
      shippingQuoteCents: quote, potifyContributionCents: contribution,
      balanceCents: balance, orderReference, fulfillmentStatus: status };
    const [updated] = await tx.update(spinClaimsTable).set({ status, shipping, updatedAt: new Date() })
      .where(eq(spinClaimsTable.id, id)).returning();
    await tx.insert(spinClaimAuditTable).values({
      claimId: id, actorId, fromStatus: claim.status, toStatus: status,
      note: `${note} | Private shipping quote cents: ${quote}; POTIFY contribution cents: ${contribution}; balance cents: ${balance}; choices: ${JSON.stringify(choices)}; order reference: ${orderReference ?? "pending"}`,
    });
    return { claim: updated };
  });
}