import { useEffect, type ReactNode } from "react";
import { Link } from "wouter";

export const STORE_URL = "https://potify-project.printify.me/";
export const COMMUNITY_URL = "https://t.me/officialpepeusdt";
export const SPIN_URL = "https://potifywebsite.com/spin";

export function productUrl(id: number | null | undefined) {
  return id ? `${STORE_URL}product/${id}` : STORE_URL;
}

type ApiErrorLike = Error & { status: number; data: unknown };
function isApiError(e: unknown): e is ApiErrorLike {
  return e instanceof Error && typeof (e as { status?: unknown }).status === "number";
}

export function errorMessage(err: unknown): string {
  if (isApiError(err)) {
    const d = err.data as { error?: unknown } | null;
    if (d && typeof d.error === "string") return d.error;
    if (err.status === 429) return "Too many requests. Please wait a moment and try again.";
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

export function errorStatus(err: unknown): number | null {
  return isApiError(err) ? err.status : null;
}

export function usePageMeta(title: string, description: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const created = !meta;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    const prevDesc = meta.content;
    meta.content = description;
    return () => {
      document.title = prev;
      if (created) meta?.remove();
      else if (meta) meta.content = prevDesc;
    };
  }, [title, description]);
}

export function fmtDate(v: string | null | undefined) {
  if (!v) return "Not set";
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function SpinHeader({ right }: { right?: ReactNode }) {
  return (
    <header className="border-b border-border/50 bg-background/85 backdrop-blur-md sticky top-0 z-40">
      <div className="mx-auto max-w-6xl px-4 sm:px-5 min-h-16 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <Link href="/" data-testid="link-spin-home" aria-label="POTIFY home" className="flex min-h-11 items-center text-[#A78B4B] hover:text-foreground transition-colors">
          <span className="font-serif text-xl sm:text-2xl font-bold tracking-widest text-primary">$POTIFY</span>
        </Link>
        <nav aria-label="Welcome Spin navigation" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs uppercase tracking-[0.1em] sm:tracking-[0.16em]">
          <Link href="/spin" data-testid="link-spin-public" className="flex min-h-11 items-center text-muted-foreground hover:text-foreground">Spin</Link>
          <Link href="/spin/verify" data-testid="link-spin-verify" className="flex min-h-11 items-center text-muted-foreground hover:text-foreground">Verify</Link>
          {right}
        </nav>
      </div>
    </header>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`premium-card rounded-md p-5 md:p-7 ${className}`}>{children}</section>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-[#A78B4B] mb-3">{children}</p>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted/70 ${className}`} />;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded border border-destructive/40 bg-destructive/10 p-4 text-sm">
      <p className="text-foreground">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 min-h-11 px-4 border border-border text-xs uppercase tracking-widest hover:border-[#A78B4B]">
          Try again
        </button>
      )}
    </div>
  );
}

export type SpinTerms = { instructions: string; sponsorContact: string; entryTerms: string; shippingTerms: string };

/** Reads optional term fields that newer API versions include; never invents values. */
export function readTerms(obj: unknown): SpinTerms {
  const o = (obj && typeof obj === "object" ? obj : {}) as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
  return { instructions: s("instructions"), sponsorContact: s("sponsorContact"), entryTerms: s("entryTerms"), shippingTerms: s("shippingTerms") };
}

export function TermsBlock({ terms, show }: { terms: SpinTerms; show: (keyof SpinTerms)[] }) {
  const labels: Record<keyof SpinTerms, string> = { entryTerms: "Entry terms", shippingTerms: "Shipping eligibility", instructions: "Winner instructions", sponsorContact: "Sponsor contact" };
  const rows = show.filter((k) => terms[k]);
  if (!rows.length) return <p className="text-sm text-muted-foreground">Terms have not been published yet.</p>;
  return (
    <dl className="space-y-4">
      {rows.map((k) => (
        <div key={k}>
          <dt className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#A78B4B] mb-1">{labels[k]}</dt>
          <dd className="text-sm leading-relaxed text-foreground/85 whitespace-pre-wrap">{terms[k]}</dd>
        </div>
      ))}
    </dl>
  );
}
