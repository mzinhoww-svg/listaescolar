import { SITE_COPY } from "@/features/site/copy";
import type { PurchaseChannels } from "@/features/site/channels";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

function Chip({ abbr, name, accent = false }: { abbr: string; name: string; accent?: boolean }) {
  return (
    <li className="flex w-20 flex-col items-center gap-1.5 text-center">
      <span
        aria-hidden
        className={`flex size-12 items-center justify-center rounded-full border text-xs font-extrabold ${accent ? "bg-verde-certo border-verde-certo text-tinta" : "border-linha bg-white text-tinta"}`}
      >
        {abbr}
      </span>
      <span className="text-[11px] leading-tight font-bold">{name}</span>
    </li>
  );
}

/** Nomes vêm dos varejistas ativos do banco; sem dado, nada é exibido. */
export function ChannelsStrip({ channels }: { channels: PurchaseChannels | null }) {
  if (!channels || (channels.retailers.length === 0 && !channels.hasStationeries)) return null;
  return (
    <div className="bg-white rounded-card mt-4 flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
      <h3 className="text-base font-extrabold">{SITE_COPY.steps.channelsTitle}</h3>
      <ul className="flex flex-wrap gap-x-3 gap-y-4 md:justify-end">
        {channels.retailers.map((r) => (
          <Chip key={r.slug} abbr={initials(r.name)} name={r.name} />
        ))}
        {channels.hasStationeries ? <Chip accent abbr="PB" name={SITE_COPY.steps.stationeries} /> : null}
      </ul>
    </div>
  );
}
