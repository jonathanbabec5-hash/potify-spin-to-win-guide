export type Prize = { key: string; name: string; imageUrl: string | null; printifyProductId?: number | null; variants?: { id: string; description: string }[] };
export type Promotion = {
  campaignId: string; active: boolean; status: string; announcementUrl: string | null;
  startsAt: string | null; endsAt: string | null; timezone: string;
  eligibleCount: number | null; odds: { any: string; eachPrize: string } | null;
  prizes: Prize[]; sponsorContact?: string; entryTerms?: string; shippingTerms?: string;
  prizeVariants?: Record<string, Array<{ id: string; description: string; valueCents: number }>>;
  seedBonusActive?: boolean;
};
export type MemberCode = { code: string; kind: "free" | "bonus"; issuedAt: string; reviewStatus: string };
export type MemberResult = { code: string; prizeKey: string; prizeName: string; receiptCode: string | null; claimId: number | null };
export type MemberPromotion = { codes: MemberCode[]; results: MemberResult[]; seedBalance?: number | null };
export type Reply = {
  id: number; accountId?: string; handle: string; url: string; postedAt: string; comment: string;
  status: string; codes?: Array<string | { code: string; status?: string }>; reason?: string | null; createdAt?: string;
};
export type DrawReceipt = {
  snapshotHash: string; snapshotCount: number; drawnAt: string;
  algorithm?: string; version?: string; selected: { maskedCode: string; prizeKey: string }[];
};

/** The existing web app uses same-origin session cookies. Never send entry codes to third parties. */
export async function promotionApi<T>(path: string, data?: object, method: "POST" | "PUT" = "POST"): Promise<T> {
  const response = await fetch(`/api/promotion${path}`, {
    method: data === undefined ? "GET" : method,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Accept": "application/json", ...(data === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error : `Request failed (HTTP ${response.status})`;
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}