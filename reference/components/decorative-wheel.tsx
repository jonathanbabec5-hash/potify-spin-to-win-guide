import { useEffect, useState } from "react";
type Artwork = { key: string; name: string; imageUrl: string | null };

/** An entry animation only. Artwork rotates past the viewport; the server alone owns the draw. */
export function DecorativeWheel({ rotation, spinning, reduced, prizes = [], securedCode = null }: {
  rotation: number; spinning: boolean; reduced: boolean; prizes?: Artwork[]; securedCode?: string | null;
}) {
  const [spotlight, setSpotlight] = useState(0);
  useEffect(() => {
    if (!spinning || reduced) return;
    const cycle = window.setInterval(() => setSpotlight((index) => (index + 1) % 4), 230);
    return () => window.clearInterval(cycle);
  }, [spinning, reduced]);
  const individual = prizes.filter((prize) => prize.imageUrl && !/set|bundle/i.test(prize.name)).slice(0, 3);
  const cards = prizes.length ? prizes : [];
  return (
    <div className="relative mx-auto w-full max-w-[450px] overflow-hidden rounded-xl border border-[#A78B4B]/60 bg-[radial-gradient(circle_at_50%_40%,#253827,#0b140e_70%)] p-3 sm:p-5 shadow-[0_24px_55px_rgba(0,0,0,0.42)]">
      <div className="flex items-center justify-center gap-2 text-[#d7b668] text-[10px] uppercase tracking-[0.25em]">
        <span aria-hidden="true">✦</span> POTIFY · The sticker collection <span aria-hidden="true">✦</span>
      </div>
      <div className="relative mt-4 overflow-hidden rounded-lg border border-[#A78B4B]/30 bg-[#101c13]">
        <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 border-x-[9px] border-x-transparent border-t-[13px] border-t-[#d7b668]" aria-hidden="true" />
        <div className={`grid grid-cols-2 gap-2 p-3 sm:p-4 ${spinning && !reduced ? "motion-safe:animate-pulse" : ""}`}
          style={{ transform: spinning && !reduced ? `translateY(${Math.sin(rotation) * 3}px)` : undefined }}>
          {cards.map((prize, index) => {
            const bundle = /set|bundle/i.test(prize.name);
            return <div key={prize.key} className={`min-w-0 rounded-md border bg-[#18271b] p-2 text-center transition-[border-color,transform,box-shadow] duration-200 ${spinning && spotlight === index ? "z-[1] scale-[1.04] border-[#ead187] shadow-[0_0_26px_rgba(215,182,104,.45)]" : "border-[#A78B4B]/35"}`}>
              <div className="aspect-square w-full rounded bg-[#ebe3d2] p-1.5">
                {prize.imageUrl ? <img src={prize.imageUrl} alt="" className="h-full w-full object-contain" /> :
                  <div className="grid h-full grid-cols-2 gap-1" aria-hidden="true">{individual.map((part) =>
                    <img key={part.key} src={part.imageUrl!} alt="" className="h-full min-h-0 w-full object-contain" />)}</div>}
              </div>
              <p className="mt-2 min-h-9 text-[11px] leading-tight text-[#e7d2a6] sm:text-sm">{bundle ? "Grand prize · Complete Sticker Set" : prize.name}</p>
            </div>;
          })}
          {!cards.length && <div className="col-span-2 py-16 text-center text-sm text-[#d7b668]">Sticker artwork is loading</div>}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-[#0a120d] to-transparent" />
        {securedCode && !spinning && <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0b140e]/95 p-5">
          <div className="w-full rounded border border-[#d7b668] bg-[#16251a] p-4 text-center shadow-xl">
            <p className="font-serif text-2xl text-[#d7b668]">Entry secured</p>
            <p className="mt-2 text-xs text-[#ddd5c3]">Owner validation pending · no prize selected</p>
            <code className="mt-4 block break-all text-xs leading-relaxed text-foreground select-all">{securedCode}</code>
          </div>
        </div>}
      </div>
      <p className="mt-4 text-center font-serif text-lg text-[#d7b668]">One drawing after entries close</p>
      <p className="mt-1 text-center text-[11px] leading-relaxed text-[#d6d1c3]">Artwork is illustrative. The entry animation never selects or lands on a prize.</p>
    </div>
  );
}