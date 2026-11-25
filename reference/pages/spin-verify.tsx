import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useRoute } from "wouter";
import type { SpinReceipt } from "@workspace/api-client-react";
import { promotionApi, type DrawReceipt } from "@/components/spin/promotion-api";
import { Eyebrow, ErrorBox, Panel, SpinHeader, fmtDate, usePageMeta } from "@/components/spin/spin-shared";

const CODE = /^[a-f0-9]{64}$/;

export default function SpinVerify() {
  usePageMeta("Verify the POTIFY drawing", "Publicly verify the saved POTIFY drawing and masked winners without exposing entry codes or member identities.");
  const [, params] = useRoute("/spin/verify/:code");
  const [, navigate] = useLocation();
  const code = params?.code ?? "";
  const [input, setInput] = useState(code);
  const [receipt, setReceipt] = useState<SpinReceipt | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "invalid" | "unavailable" | "valid">("idle");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [draw, setDraw] = useState<DrawReceipt | null>(null);
  useEffect(() => {
    let cancelled = false;
    void promotionApi<DrawReceipt>("/receipt").then((record) => {
      if (!cancelled) setDraw(record);
    }).catch(() => { if (!cancelled) setDraw(null); });
    return () => { cancelled = true; };
  }, [refresh]);

  useEffect(() => {
    setInput(code);
    setReceipt(null);
    setError("");
    if (!code) { setState("idle"); return; }
    if (!CODE.test(code)) { setState("invalid"); return; }
    const controller = new AbortController();
    setState("loading");
    fetch(`/api/spin/receipts/${code}`, { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        if (res.status === 404) { setState("invalid"); return; }
        if (!res.ok) throw new Error(`Verification is unavailable (HTTP ${res.status}). Please try again.`);
        const data: unknown = await res.json();
        if (!data || typeof data !== "object" ||
          typeof (data as SpinReceipt).prizeName !== "string" ||
          typeof (data as SpinReceipt).wonAt !== "string" ||
          typeof (data as SpinReceipt).claimDeadline !== "string" ||
          Number.isNaN(new Date((data as SpinReceipt).claimDeadline).getTime()) ||
          typeof (data as SpinReceipt).claimWindowOpen !== "boolean" ||
          !["pending", "submitted", "shipping_balance_required", "confirmed", "fulfilled"].includes((data as SpinReceipt).status)) {
          throw new Error("The verification response was incomplete. Please try again later.");
        }
        setReceipt(data as SpinReceipt);
        setState("valid");
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Verification is unavailable. Please try again.");
        setState("unavailable");
      });
    return () => controller.abort();
  }, [code, refresh]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const candidate = input.trim().toLowerCase();
    if (!CODE.test(candidate)) { setReceipt(null); setState("invalid"); return; }
    if (candidate === code) {
      // Re-check so a receipt revoked since last viewing cannot look valid.
      setRefresh((n) => n + 1);
      return;
    }
    navigate(`/spin/verify/${candidate}`);
  };

  return (
    <div className="dark min-h-[100dvh] bg-background text-foreground grain-overlay">
      <SpinHeader />
      <main className="relative mx-auto max-w-xl px-5 py-12 md:py-20">
        <Eyebrow>Welcome Promotion · Public drawing receipt</Eyebrow>
        <h1 className="font-serif text-4xl md:text-5xl text-heir">Verify the drawing</h1>
        <p className="mt-3 mb-8 text-sm leading-relaxed text-muted-foreground">One drawing after entry close. This page shows only the saved draw, masked winning codes and claim statuses—never full entry codes, email, X identity, address or claim credentials. A public receipt or QR cannot redeem a prize.</p>
        <Panel className="mb-6">
          {draw ? <div>
            <Eyebrow>Immutable recorded draw</Eyebrow>
            <p className="text-sm">Drawn {fmtDate(draw.drawnAt)} · {draw.snapshotCount} eligible codes</p>
            <p className="mt-2 break-all text-xs text-muted-foreground">Snapshot SHA-256: {draw.snapshotHash}</p>
            <p className="mt-2 text-sm">Each eligible code: 4/{draw.snapshotCount} chance of any prize; 1/{draw.snapshotCount} chance of each specific prize.</p>
            <ul className="mt-4 space-y-2 text-sm">{draw.selected.map((winner, i) => <li key={`${winner.maskedCode}-${i}`} className="border-l-2 border-[#A78B4B] pl-3">{winner.prizeKey === "sticker-bundle" ? "Grand prize · Complete Sticker Set" : winner.prizeKey.replaceAll("-", " ")} · masked code {winner.maskedCode}</li>)}</ul>
          </div> : <p className="text-sm text-muted-foreground">No completed draw is publicly available yet. The owner must activate the announcement, close entries, freeze eligibility and run the one-time draw first.</p>}
        </Panel>
        <Panel>
          <Eyebrow>Private winner receipt verification · legacy claims supported</Eyebrow>
          <p className="mb-5 text-sm text-muted-foreground">If you have a separate receipt code, you may verify its status below. Never enter your 64-character public entry code here; only a winning account can submit a private claim.</p>
          <form onSubmit={submit} className="space-y-3">
            <label htmlFor="receipt-code" className="block text-xs uppercase tracking-widest text-muted-foreground">Receipt code</label>
            <input id="receipt-code" value={input} onChange={(e) => setInput(e.target.value)} autoComplete="off" spellCheck={false} maxLength={64} placeholder="Paste the 64-character code" className="w-full min-h-11 rounded border border-border bg-[#18251b] px-3 py-2 font-mono text-xs text-foreground focus:border-primary focus:outline-none" />
            <button type="submit" className="min-h-11 bg-[#A78B4B] px-6 text-xs font-semibold uppercase tracking-widest text-[#0A0D0A]">Verify code</button>
          </form>
          <div className="mt-6" aria-live="polite">
            {state === "loading" && <p className="text-sm text-muted-foreground">Checking the original receipt…</p>}
            {state === "invalid" && <ErrorBox message="No valid receipt found. This code may be unknown, malformed or revoked. No win is verified." />}
            {state === "unavailable" && <ErrorBox message={error} />}
            {state === "valid" && receipt && (
              <div className="rounded border border-[#A78B4B]/60 bg-[#A78B4B]/10 p-5">
                <Eyebrow>Verified claim receipt</Eyebrow>
                <dl className="space-y-3 text-sm">
                  {receipt.campaignId && <div><dt className="text-xs text-muted-foreground">Campaign</dt><dd>{receipt.campaignId}</dd></div>}
                  <div><dt className="text-xs text-muted-foreground">Prize</dt><dd className="font-serif text-2xl">{receipt.prizeName}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Awarded</dt><dd>{fmtDate(receipt.wonAt)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Claim status</dt><dd className="capitalize">{receipt.status}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Claim deadline (exclusive)</dt><dd>{new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "long", timeStyle: "short" }).format(new Date(receipt.claimDeadline))} Eastern</dd></div>
                  <div><dt className="text-xs text-muted-foreground">New claim window</dt><dd>{receipt.claimWindowOpen ? "Open for the winning account" : "Closed to new claims"}</dd></div>
                </dl>
                  <p className="mt-4 text-xs text-muted-foreground">Verification reflects the recorded win and claim status at the time checked. A closed claim window does not invalidate a submitted or fulfilled win. This page does not identify the winner, grant redemption or transfer rights, or guarantee delivery. Only the signed-in winning account can submit a private claim.</p>
              </div>
            )}
          </div>
        </Panel>
      </main>
    </div>
  );
}