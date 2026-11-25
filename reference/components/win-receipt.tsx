import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Link } from "wouter";
import { basePath } from "@/components/auth/auth-pages";
import { ErrorBox, Eyebrow } from "@/components/spin/spin-shared";

const RECEIPT_CODE = /^[a-f0-9]{64}$/;

export function receiptLink(code: string) {
  return `${window.location.origin}${basePath}/spin/verify/${code}`;
}

/** This is only rendered for the authenticated account's original, server-saved winning result. */
export function WinReceipt({ shareCode }: { shareCode: string | null | undefined }) {
  const [qr, setQr] = useState("");
  const [qrError, setQrError] = useState("");
  const [notice, setNotice] = useState("");
  const code = shareCode && RECEIPT_CODE.test(shareCode) ? shareCode : null;
  const link = code ? receiptLink(code) : "";

  useEffect(() => {
    setQr("");
    setQrError("");
    if (!link) return;
    let active = true;
    QRCode.toDataURL(link, { errorCorrectionLevel: "M", margin: 3, width: 320, color: { dark: "#0A0D0A", light: "#FFFFFF" } })
      .then((url) => { if (active) setQr(url); })
      .catch(() => { if (active) setQrError("Could not generate the receipt QR code. You can still copy the verification link."); });
    return () => { active = false; };
  }, [link]);

  if (!code) return null;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${label} copied.`);
    } catch {
      setNotice("Copy failed. Select and copy the code or link below.");
    }
  };
  const download = () => {
    if (!qr) return;
    try {
      const anchor = document.createElement("a");
      anchor.href = qr;
      anchor.download = `potify-win-verification-${code.slice(0, 12)}.png`;
      anchor.click();
    } catch {
      setNotice("QR download failed. Copy the verification link instead.");
    }
  };

  return (
    <section aria-label="Your original win receipt" className="mt-7 border-t border-border/60 pt-6">
      <Eyebrow>Original recorded win · public verification</Eyebrow>
       <p className="text-sm text-foreground/80 max-w-xl">This receipt links to your original saved win. Anyone with the code can check the prize, win date and current claim status. Your name, account and shipping details stay private. Sharing this code does not transfer your prize or grant anyone redemption rights.</p>
      <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_auto] items-start">
        <div className="min-w-0 space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Verification code</p>
            <code className="block break-all text-xs select-all text-[#d7b668]">{code}</code>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Public verification link</p>
            <Link href={`/spin/verify/${code}`} className="block break-all text-xs text-primary underline underline-offset-4">{link}</Link>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => copy(code, "Code")} className="min-h-11 border border-border px-4 text-xs uppercase tracking-widest hover:border-primary">Copy code</button>
            <button type="button" onClick={() => copy(link, "Link")} className="min-h-11 border border-border px-4 text-xs uppercase tracking-widest hover:border-primary">Copy link</button>
            {navigator.share && <button type="button" onClick={async () => { try { await navigator.share({ title: "POTIFY Win Verification", url: link }); } catch { /* Share cancelled. */ } }} className="min-h-11 border border-border px-4 text-xs uppercase tracking-widest hover:border-primary">Share link</button>}
          </div>
          <p role="status" className="text-xs text-muted-foreground">{notice}</p>
        </div>
        {qr && (
          <div className="flex flex-col items-center gap-2">
            <img src={qr} width={160} height={160} alt="QR code for the public verification link shown here" className="rounded border-4 border-white bg-white" />
            <button type="button" onClick={download} className="min-h-11 text-xs text-primary underline underline-offset-4">Download matching QR</button>
          </div>
        )}
      </div>
      {qrError && <ErrorBox message={qrError} />}
    </section>
  );
}