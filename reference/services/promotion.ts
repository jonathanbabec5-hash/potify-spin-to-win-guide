import { createHash, randomBytes, randomInt } from "node:crypto";
import { db, spinCampaignsTable, spinCampaignAuditTable, spinEntriesTable, spinClaimsTable, promotionRepliesTable, promotionDrawsTable, promotionSeedAuditTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { PRIZES, claimDeadlineFor } from "./welcome-spin";
import { spendEarnedSeeds, verifiedSeedBalance } from "./verified-seeds";

export const PROMOTION_ID = "welcome-promotion-2026";
const zone = "America/New_York";
const codeHash = (code: string) => createHash("sha256").update(code).digest("hex");
export function chooseFour<T>(eligible: readonly T[], nextIndex: (max: number) => number = randomInt): T[] {
  if (eligible.length < 4) throw new PromotionError("At least four approved distinct codes required");
  const pool = [...eligible], chosen: T[] = [];
  for (let i = 0; i < 4; i++) {
    const index = nextIndex(pool.length);
    if (!Number.isSafeInteger(index) || index < 0 || index >= pool.length)
      throw new PromotionError("Invalid draw index");
    chosen.push(pool.splice(index, 1)[0]);
  }
  return chosen;
}
const lock = (tx: any) => tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${PROMOTION_ID + ":global"}, 0))`);
export class PromotionError extends Error { constructor(message: string, public status = 409) { super(message); } }
export const officialAnnouncement = (value: string) => /^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/potify_project\/status\/[0-9]+(?:\?.*)?$/i.test(value);
const replyUrl = (value: string) => /^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[a-zA-Z0-9_]{1,15}\/status\/[0-9]+(?:\?.*)?$/i.test(value);
const normalized = (value: string) => new URL(value).pathname.toLowerCase().replace(/\/$/, "");
const fmt = (date: Date) => Object.fromEntries(new Intl.DateTimeFormat("en-US", {
  timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
}).formatToParts(date).filter(p => p.type !== "literal").map(p => [p.type, Number(p.value)]));
export function thirtyLocalDays(start: Date) {
  const p = fmt(start);
  const local = Date.UTC(p.year, p.month - 1, p.day + 30, p.hour, p.minute, p.second);
  let end = new Date(start.getTime() + 30 * 86400000);
  for (let i = 0; i < 4; i++) {
    const q = fmt(end);
    const diff = local - Date.UTC(q.year, q.month - 1, q.day, q.hour, q.minute, q.second);
    if (!diff) break;
    end = new Date(end.getTime() + diff);
  }
  const check = fmt(end);
  if (local !== Date.UTC(check.year, check.month - 1, check.day, check.hour, check.minute, check.second))
    throw new PromotionError("Activation time falls in an ambiguous daylight-saving transition; retry later");
  return end;
}
async function campaign(tx: any) {
  const [row] = await tx.select().from(spinCampaignsTable).where(eq(spinCampaignsTable.id, PROMOTION_ID));
  return row as typeof spinCampaignsTable.$inferSelect | undefined;
}
export async function promotionPublic() {
  const [row] = await db.select().from(spinCampaignsTable).where(eq(spinCampaignsTable.id, PROMOTION_ID));
  const [draw] = await db.select().from(promotionDrawsTable).where(eq(promotionDrawsTable.campaignId, PROMOTION_ID));
  const now = new Date();
  return {
    campaignId: PROMOTION_ID, active: !!row?.active && !!row.startsAt && !!row.endsAt && now >= row.startsAt && now < row.endsAt,
    status: draw?.drawnAt ? "drawn" : draw ? "frozen" : !row?.startsAt ? "awaiting_announcement" : now >= row.endsAt! ? "closed" : row.active ? "open" : "disabled",
    announcementUrl: row?.announcementUrl ?? null, startsAt: row?.startsAt?.toISOString() ?? null,
    endsAt: row?.endsAt?.toISOString() ?? null, timezone: zone,
    sponsorContact: "@potify_project", entryTerms: row?.entryTerms ?? "",
    shippingTerms: row?.shippingTerms ?? "",
    eligibleCount: draw?.snapshotCount ?? null,
    odds: draw ? { any: `4/${draw.snapshotCount}`, eachPrize: `1/${draw.snapshotCount}` } : null,
    prizes: PRIZES.map(p => ({ key: p.key, name: p.name, imageUrl: p.imageUrl })),
    seedBonusActive: !!row?.seedBonus?.enabled,
  };
}
export async function promotionMe(accountId: string) {
  const entries = await db.select().from(spinEntriesTable).where(and(eq(spinEntriesTable.campaignId, PROMOTION_ID), eq(spinEntriesTable.accountId, accountId))).orderBy(spinEntriesTable.id);
  const claims = await db.select().from(spinClaimsTable).where(eq(spinClaimsTable.accountId, accountId));
  return {
    seedBalance: await verifiedSeedBalance(accountId),
    codes: entries.map(e => ({ code: e.publicCode, kind: e.entryKind, issuedAt: e.createdAt.toISOString(), reviewStatus: e.reviewStatus,
      outcome: e.outcome === "pending" ? null : e.outcome })),
    results: entries.filter(e => e.outcome === "win").map(e => {
      const c = claims.find(c => c.entryId === e.id);
      return { code: e.publicCode, outcome: e.outcome, prizeKey: e.prizeKey, prizeName: e.prizeName,
        receiptCode: c?.receiptRevokedAt ? null : c?.shareCode ?? null, claimId: c?.id ?? null };
    }),
  };
}
export async function issueCode(accountId: string, email: string, kind: "free" | "bonus", requestId?: string) {
  return db.transaction(async tx => {
    await lock(tx);
    const row = await campaign(tx);
    const now = new Date();
    if (!row?.active || !row.announcementUrl || !row.startsAt || !row.endsAt || now < row.startsAt || now >= row.endsAt)
      throw new PromotionError("Entries are closed");
    const own = await tx.select().from(spinEntriesTable).where(and(eq(spinEntriesTable.campaignId, PROMOTION_ID), eq(spinEntriesTable.accountId, accountId)));
    if (kind === "free" && own.some(e => e.entryKind === "free")) {
      const e = own.find(e => e.entryKind === "free")!;
      return { code: e.publicCode, kind: e.entryKind, issuedAt: e.createdAt.toISOString(), reviewStatus: e.reviewStatus };
    }
    if (kind === "bonus") {
      const bonus = row.seedBonus;
      if (!requestId || !/^[a-zA-Z0-9_-]{12,128}$/.test(requestId)) throw new PromotionError("Stable bonus request ID required", 400);
      const [replay] = await tx.select().from(promotionSeedAuditTable).where(and(eq(promotionSeedAuditTable.campaignId, PROMOTION_ID), eq(promotionSeedAuditTable.accountId, accountId), eq(promotionSeedAuditTable.idempotencyKey, requestId)));
      if (replay) {
        const [e] = await tx.select().from(spinEntriesTable).where(eq(spinEntriesTable.id, replay.entryId));
        return { code: e.publicCode, kind: e.entryKind, issuedAt: e.createdAt.toISOString(), reviewStatus: e.reviewStatus };
      }
      if (!bonus?.enabled || !bonus.rulesVerified || !Number.isSafeInteger(bonus.seedsPerEntry) || !Number.isSafeInteger(bonus.perMemberCap) || !Number.isSafeInteger(bonus.campaignCap) ||
        !bonus.seedsPerEntry || !bonus.perMemberCap || !bonus.campaignCap) throw new PromotionError("Seed bonus is not configured and verified");
      if (own.filter(e => e.entryKind === "bonus").length >= bonus.perMemberCap) throw new PromotionError("Member bonus cap reached");
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(spinEntriesTable).where(and(eq(spinEntriesTable.campaignId, PROMOTION_ID), eq(spinEntriesTable.entryKind, "bonus")));
      if (count >= bonus.campaignCap) throw new PromotionError("Campaign bonus cap reached");
      try { await spendEarnedSeeds(tx, accountId, bonus.seedsPerEntry, `${PROMOTION_ID}:${requestId}`); }
      catch (error) {
        if (error instanceof Error && error.message === "Insufficient earned Seeds")
          throw new PromotionError("Insufficient earned Seeds");
        throw error;
      }
    }
    const [e] = await tx.insert(spinEntriesTable).values({
      campaignId: PROMOTION_ID, accountId, email, publicCode: randomBytes(32).toString("hex"),
      entryKind: kind, reviewStatus: "pending", outcome: "pending",
    }).returning();
    if (kind === "bonus") await tx.insert(promotionSeedAuditTable).values({
      campaignId: PROMOTION_ID, accountId, entryId: e.id, idempotencyKey: requestId!, seedsSpent: row.seedBonus.seedsPerEntry!,
    });
    return { code: e.publicCode, kind, issuedAt: e.createdAt.toISOString(), reviewStatus: "pending" };
  });
}

export async function submitReply(accountId: string, input: { handle: string; url: string; postedAt: string; comment: string }) {
  if (!/^@?[a-zA-Z0-9_]{1,15}$/.test(input.handle) || !replyUrl(input.url) || !Number.isFinite(Date.parse(input.postedAt)) ||
      input.comment.trim().length < 30 || input.comment.length > 3000)
    throw new PromotionError("Valid X handle, direct reply URL, timestamp and substantive comment required", 400);
  if (new URL(input.url).pathname.split("/")[1]?.toLowerCase() !== input.handle.replace(/^@/, "").toLowerCase())
    throw new PromotionError("X handle must match the submitted reply URL", 400);
  return db.transaction(async tx => {
    await lock(tx);
    const row = await campaign(tx);
    const postedAt = new Date(input.postedAt), now = new Date();
    if (!row?.active || !row.startsAt || !row.endsAt || now >= row.endsAt || postedAt < row.startsAt || postedAt >= row.endsAt || postedAt > now)
      throw new PromotionError("Reply must be submitted and posted within the open window");
    const own = await tx.select().from(spinEntriesTable).where(and(eq(spinEntriesTable.campaignId, PROMOTION_ID), eq(spinEntriesTable.accountId, accountId)));
    if (!own.some(e => e.publicCode && input.comment.includes(e.publicCode))) throw new PromotionError("Reply must contain your assigned code", 400);
    const tokens = input.comment.match(/\b[a-f0-9]{64}\b/gi) ?? [];
    if (tokens.some(code => !own.some(e => e.publicCode === code))) throw new PromotionError("Replies cannot validate copied codes belonging to another account", 400);
    const [reply] = await tx.insert(promotionRepliesTable).values({ campaignId: PROMOTION_ID, accountId, handle: input.handle, url: input.url, postedAt, comment: input.comment }).onConflictDoNothing().returning();
    if (!reply) throw new PromotionError("Reply already submitted");
    return { id: reply.id, status: reply.status };
  });
}

export async function activatePromotion(ownerId: string, announcementUrl: string) {
  if (!officialAnnouncement(announcementUrl)) throw new PromotionError("Official @potify_project X announcement URL required", 400);
  return db.transaction(async tx => {
    await lock(tx);
    const previous = await campaign(tx);
    if (previous?.startsAt) throw new PromotionError("Already activated: start and announcement cannot change");
    const now = new Date(), endsAt = thirtyLocalDays(now);
    const values = {
      id: PROMOTION_ID, active: true, announcementUrl: normalized(announcementUrl).startsWith("/potify_project/status/") ? new URL(announcementUrl).origin + normalized(announcementUrl) : announcementUrl,
      startsAt: now, endsAt, sponsorContact: "@potify_project",
      entryTerms: `${previous?.entryTerms ?? ""}\nOfficial @potify_project announcement: ${announcementUrl}. Starts ${now.toISOString()} and closes ${endsAt.toISOString()} (${zone}). Each eligible code has 4/N chance of any prize and 1/N chance of each specific prize once N is frozen; no fixed odds before close.`,
      shippingTerms: previous?.shippingTerms ?? "", instructions: previous?.instructions ?? "",
      prizeVariants: previous?.prizeVariants ?? {},
      seedBonus: previous?.seedBonus ?? { seedsPerEntry: null, perMemberCap: null, campaignCap: null, rulesVerified: false, enabled: false },
    };
    // Never permit activation with missing fulfillment options or unapproved rules.
    if (!previous?.rulesConfirmed || !previous.fulfillmentConfirmed || PRIZES.slice(0, 3).some(p => !previous.prizeVariants[p.key]?.length))
      throw new PromotionError("Owner must verify terms and sticker fulfillment options before activation");
    await tx.insert(spinCampaignsTable).values(values).onConflictDoUpdate({ target: spinCampaignsTable.id, set: values });
    await tx.insert(spinCampaignAuditTable).values({ campaignId: PROMOTION_ID, actorId: ownerId, action: "activate", before: previous ? { active: previous.active, startsAt: previous.startsAt } : null, after: { announcementUrl: values.announcementUrl, startsAt: now.toISOString(), endsAt: endsAt.toISOString() } });
    return { startsAt: now.toISOString(), endsAt: endsAt.toISOString(), announcementUrl: values.announcementUrl };
  });
}

export async function reviewReply(ownerId: string, replyId: number, input: { approved: boolean; reason: string; verifiedPostedAt: string; verifiedParentUrl: string; verifiedComment: string }) {
  if (!Number.isSafeInteger(replyId) || replyId <= 0 || input.reason?.trim().length < 12 || !Number.isFinite(Date.parse(input.verifiedPostedAt)) || input.verifiedComment?.trim().length < 30)
    throw new PromotionError("Owner evidence and a meaningful reason required", 400);
  return db.transaction(async tx => {
    await lock(tx);
    const row = await campaign(tx);
    if (!row?.startsAt || !row.endsAt || row.frozenAt || new Date() >= row.endsAt) throw new PromotionError("Review is closed");
    const [reply] = await tx.select().from(promotionRepliesTable).where(and(eq(promotionRepliesTable.id, replyId), eq(promotionRepliesTable.campaignId, PROMOTION_ID)));
    if (!reply || reply.status !== "pending") throw new PromotionError("Reply not pending");
    const verifiedAt = new Date(input.verifiedPostedAt);
    const own = await tx.select().from(spinEntriesTable).where(and(eq(spinEntriesTable.campaignId, PROMOTION_ID), eq(spinEntriesTable.accountId, reply.accountId)));
    const matched = own.filter(e => e.publicCode && reply.comment.includes(e.publicCode) && input.verifiedComment.includes(e.publicCode));
    const evidenceValid = replyUrl(reply.url) && normalized(reply.url) !== normalized(row.announcementUrl!) &&
      officialAnnouncement(row.announcementUrl!) && officialAnnouncement(input.verifiedParentUrl) &&
      normalized(input.verifiedParentUrl) === normalized(row.announcementUrl!) &&
      verifiedAt >= row.startsAt && verifiedAt < row.endsAt && verifiedAt <= new Date() && reply.postedAt >= row.startsAt && reply.postedAt < row.endsAt &&
      matched.length > 0 &&
      (input.verifiedComment.match(/\b[a-f0-9]{64}\b/gi) ?? []).every(code => own.some(e => e.publicCode === code)) &&
      input.verifiedComment.replace(/[a-f0-9]{64}/gi, "").trim().length >= 30;
    if (input.approved && !evidenceValid) throw new PromotionError("Verified direct-parent, exact assigned code, in-window timestamp and substantive project comment required");
    await tx.update(promotionRepliesTable).set({
      status: input.approved ? "approved" : "rejected", ownerId, ownerReason: input.reason.trim(),
      verifiedPostedAt: verifiedAt, verifiedParentUrl: input.verifiedParentUrl,
      verifiedComment: input.verifiedComment, reviewedAt: new Date(),
    }).where(eq(promotionRepliesTable.id, replyId));
    if (input.approved) await tx.update(spinEntriesTable).set({ reviewStatus: "approved" }).where(sql`${spinEntriesTable.id} IN (${sql.join(matched.map(e => sql`${e.id}`), sql`, `)})`);
    return { id: replyId, status: input.approved ? "approved" : "rejected", matchedCodes: input.approved ? matched.length : 0 };
  });
}

export async function freezePromotion(ownerId: string) {
  return db.transaction(async tx => {
    await lock(tx);
    const [existing] = await tx.select().from(promotionDrawsTable).where(eq(promotionDrawsTable.campaignId, PROMOTION_ID));
    if (existing) return existing;
    const row = await campaign(tx);
    if (!row?.endsAt || new Date() < row.endsAt) throw new PromotionError("Cannot freeze before close");
    const eligible = await tx.select().from(spinEntriesTable).where(and(eq(spinEntriesTable.campaignId, PROMOTION_ID), eq(spinEntriesTable.reviewStatus, "approved"))).orderBy(spinEntriesTable.id);
    if (eligible.length < 4) throw new PromotionError("At least four approved distinct codes required");
    const hashes = eligible.map(e => codeHash(e.publicCode!)).sort();
    const snapshotHash = codeHash(JSON.stringify(hashes));
    const [snapshot] = await tx.insert(promotionDrawsTable).values({ campaignId: PROMOTION_ID, ownerId, snapshotHash, snapshotCount: hashes.length, codeHashes: hashes }).returning();
    await tx.update(spinCampaignsTable).set({ frozenAt: snapshot.frozenAt, active: false }).where(eq(spinCampaignsTable.id, PROMOTION_ID));
    await tx.insert(spinCampaignAuditTable).values({ campaignId: PROMOTION_ID, actorId: ownerId, action: "freeze", after: { snapshotHash, snapshotCount: hashes.length } });
    return snapshot;
  });
}

export async function drawPromotion(ownerId: string) {
  return db.transaction(async tx => {
    await lock(tx);
    const [snapshot] = await tx.select().from(promotionDrawsTable).where(eq(promotionDrawsTable.campaignId, PROMOTION_ID));
    if (!snapshot) throw new PromotionError("Freeze eligibility after close first");
    if (snapshot.drawnAt) return snapshot;
    const eligible = await tx.select().from(spinEntriesTable).where(and(eq(spinEntriesTable.campaignId, PROMOTION_ID), eq(spinEntriesTable.reviewStatus, "approved"))).orderBy(spinEntriesTable.id);
    const hashes = eligible.map(e => codeHash(e.publicCode!)).sort();
    if (eligible.length !== snapshot.snapshotCount || codeHash(JSON.stringify(hashes)) !== snapshot.snapshotHash || hashes.some((h, i) => h !== snapshot.codeHashes[i]))
      throw new PromotionError("Eligibility changed since freeze; draw blocked");
    const winners = chooseFour(eligible), selected: typeof snapshot.selected = [];
    for (let i = 0; i < 4; i++) {
      const e = winners[i];
      const prize = PRIZES[i];
      await tx.update(spinEntriesTable).set({ outcome: "win", prizeKey: prize.key, prizeName: prize.name, imageUrl: prize.imageUrl }).where(eq(spinEntriesTable.id, e.id));
      const row = await campaign(tx);
      await tx.insert(spinClaimsTable).values({
        entryId: e.id, accountId: e.accountId, email: e.email, prizeKey: prize.key, prizeName: prize.name,
        imageUrl: prize.imageUrl, variants: prize.key === "sticker-bundle"
          ? [{ id: "bundle", description: "Complete three-sticker set" },
            ...PRIZES.slice(0, 3).flatMap(p => (row?.prizeVariants[p.key] ?? []).map(v => ({
              ...v, id: `${p.key}:${v.id}`, designKey: p.key,
            })))]
          : row?.prizeVariants[prize.key] ?? [],
        shippingCountries: row?.shippingCountries ?? [], instructions: row?.instructions ?? "", sponsorContact: "@potify_project",
        shareCode: randomBytes(32).toString("hex"),
      });
      selected.push({ entryId: e.id, codeHash: codeHash(e.publicCode!), maskedCode: `${e.publicCode!.slice(0, 5)}…${e.publicCode!.slice(-5)}`, prizeKey: prize.key });
    }
    await tx.update(spinEntriesTable).set({ outcome: "loss" }).where(and(eq(spinEntriesTable.campaignId, PROMOTION_ID), eq(spinEntriesTable.reviewStatus, "approved"), eq(spinEntriesTable.outcome, "pending")));
    const drawnAt = new Date();
    const [draw] = await tx.update(promotionDrawsTable).set({ selected, drawnAt, ownerId }).where(eq(promotionDrawsTable.campaignId, PROMOTION_ID)).returning();
    await tx.insert(spinCampaignAuditTable).values({ campaignId: PROMOTION_ID, actorId: ownerId, action: "draw", after: { snapshotHash: snapshot.snapshotHash, snapshotCount: snapshot.snapshotCount, selected: selected.map(s => ({ codeHash: s.codeHash, prizeKey: s.prizeKey })), drawnAt: drawnAt.toISOString(), algorithm: draw.algorithm } });
    return draw;
  });
}
export async function drawReceipt() {
  const [draw] = await db.select().from(promotionDrawsTable).where(eq(promotionDrawsTable.campaignId, PROMOTION_ID));
  if (!draw?.drawnAt) return null;
  const winners = await Promise.all(draw.selected.map(async ({ entryId, codeHash, maskedCode, prizeKey }) => {
    const [claim] = await db.select({ status: spinClaimsTable.status, createdAt: spinClaimsTable.createdAt, receiptRevokedAt: spinClaimsTable.receiptRevokedAt })
      .from(spinClaimsTable).where(eq(spinClaimsTable.entryId, entryId));
    return { codeHash, maskedCode, prizeKey, status: claim?.status ?? "pending",
      claimDeadline: claim ? claimDeadlineFor(claim.createdAt).toISOString() : null,
      claimWindowOpen: !!claim && !claim.receiptRevokedAt && claim.status === "pending" && new Date() < claimDeadlineFor(claim.createdAt) };
  }));
  return { snapshotHash: draw.snapshotHash, snapshotCount: draw.snapshotCount,
    drawnAt: draw.drawnAt.toISOString(), algorithm: draw.algorithm,
    odds: { any: `4/${draw.snapshotCount}`, eachPrize: `1/${draw.snapshotCount}` },
    selected: winners };
}