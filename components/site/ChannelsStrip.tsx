import { SITE_COPY } from "@/features/site/copy";
import type { PurchaseChannels } from "@/features/site/channels";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

function Chip({ abbr, name }: { abbr: string; name: string }) {
  return (
    <li className="bg-white rounded-botao flex min-h-11 items-center gap-2.5 py-1.5 pr-4 pl-1.5">
      <span aria-hidden className="bg-campo text-tinta flex size-8 items-center justify-center rounded-full text-xs font-extrabold">
        {abbr}
      </span>
      <span className="text-sm font-bold">{name}</span>
    </li>
  );
}

/** Nomes vêm dos varejistas ativos do banco; sem dado, nada é exibido. */
export function ChannelsStrip({ channels }: { channels: PurchaseChannels | null }) {
  if (!channels || (channels.retailers.length === 0 && !channels.hasStationeries)) return null;
  return (
    <div className="mt-8">
      <h3 className="text-base font-extrabold">{SITE_COPY.steps.channelsTitle}</h3>
      <ul className="mt-3 flex flex-wrap gap-2.5">
        {channels.retailers.map((r) => (
          <Chip key={r.slug} abbr={initials(r.name)} name={r.name} />
        ))}
        {channels.hasStationeries ? <Chip abbr="PB" name={SITE_COPY.steps.stationeries} /> : null}
      </ul>
    </div>
  );
}
