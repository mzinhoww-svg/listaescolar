import type { PublicListVersionSummary } from "@/features/lists/types";

import { formatListDate, itemCountLabel } from "./format";

/** Histórico público: só versões publicada e substituídas (nunca candidatas nem rascunhos). */
export function VersionHistory({ versions }: { versions: PublicListVersionSummary[] }) {
  if (versions.length < 2) return null;
  return (
    <section aria-labelledby="historico" className="flex flex-col gap-3">
      <h2 id="historico" className="text-base font-extrabold">
        Histórico de versões
      </h2>
      <ol className="flex flex-col gap-2">
        {versions.map((v) => (
          <li key={v.id} className="border-linha flex items-center justify-between gap-3 rounded-[18px] border bg-white px-4 py-3">
            <div>
              <p className="text-sm font-extrabold">
                Versão {v.versionNumber} · {v.status === "published" ? "atual" : "versão anterior"}
              </p>
              <p className="text-texto-3 text-xs font-semibold">
                {formatListDate(v.publishedAt)} · {itemCountLabel(v.itemCount)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
