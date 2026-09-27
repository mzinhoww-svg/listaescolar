import { KeyMask } from "@/components/b2b/KeyMask";
import { KeyStatusBadge } from "@/components/b2b/StatusBadge";
import { ScopeChips } from "@/components/b2b/ScopeChips";
import type { PartnerOverview } from "@/features/b2b/repository";

import { RevokeButton } from "./RevokeButton";
import { RotateDialog } from "./RotateDialog";

type KeyRow = PartnerOverview["keys"][number];

function envLabel(k: KeyRow): string {
  if (k.environment === "test") return "Sandbox";
  return k.expiresAt ? "Produção (anterior)" : "Produção";
}

function formatDate(v: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(v));
}

/** Tabela de chaves (B2B02): "Produção", "Produção (anterior)" (em carência) e "Sandbox", como no design. Sem
 * `"use client"`: só exibe; `RotateDialog`/`RevokeButton` (client) cuidam da interação de cada linha. */
export function KeyTable({ keys, readOnly }: { keys: readonly KeyRow[]; readOnly: boolean }) {
  if (keys.length === 0) {
    return <p className="text-texto-2 rounded-[20px] bg-white p-6 text-[15px] font-bold">Nenhuma chave ainda.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-[20px] bg-white">
      <table className="w-full text-left text-[14px]">
        <thead>
          <tr className="text-texto-3 border-linha border-b text-[12px] uppercase">
            <th className="px-4 py-3 font-extrabold">Ambiente</th>
            <th className="px-4 py-3 font-extrabold">Chave</th>
            <th className="px-4 py-3 font-extrabold">Criada em</th>
            <th className="px-4 py-3 font-extrabold">Último uso</th>
            <th className="px-4 py-3 font-extrabold">Escopos</th>
            <th className="px-4 py-3 font-extrabold">Status</th>
            {readOnly ? null : <th className="px-4 py-3 font-extrabold">Ações</th>}
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k.id} className="border-linha border-b last:border-0">
              <td className="px-4 py-3 font-bold">{envLabel(k)}</td>
              <td className="px-4 py-3">
                <KeyMask environment={k.environment} last4={k.last4} />
              </td>
              <td className="px-4 py-3">{formatDate(k.createdAt)}</td>
              <td className="px-4 py-3">{k.lastUsedOn ? formatDate(k.lastUsedOn) : "—"}</td>
              <td className="px-4 py-3">
                <ScopeChips scopes={k.scopes} />
              </td>
              <td className="px-4 py-3">
                <KeyStatusBadge status={k.status} expiresAt={k.expiresAt} />
              </td>
              {readOnly ? null : (
                <td className="px-4 py-3">
                  {k.status === "active" ? (
                    <div className="flex flex-wrap gap-3">
                      <RotateDialog keyId={k.id} />
                      <RevokeButton keyId={k.id} />
                    </div>
                  ) : (
                    <span className="text-texto-3">—</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
