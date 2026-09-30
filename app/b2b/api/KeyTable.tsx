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

function KeyActions({ k }: { k: KeyRow }) {
  if (k.status !== "active") return <span className="text-texto-3">—</span>;
  return (
    <div className="flex flex-wrap gap-2">
      <RotateDialog keyId={k.id} />
      <RevokeButton keyId={k.id} />
    </div>
  );
}

/** Até 768 px cada chave vira um cartão (as ações não saem da tela); daqui para cima, a tabela. */
function KeyCards({ keys, readOnly }: { keys: readonly KeyRow[]; readOnly: boolean }) {
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {keys.map((k) => (
        <li key={k.id} className="flex flex-col gap-3 rounded-[20px] bg-white p-4 text-[14px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold">{envLabel(k)}</span>
            <KeyStatusBadge status={k.status} expiresAt={k.expiresAt} />
          </div>
          <KeyMask environment={k.environment} last4={k.last4} />
          <p className="text-texto-2 font-semibold">
            Criada em {formatDate(k.createdAt)} · Último uso{" "}
            {k.lastUsedOn ? formatDate(k.lastUsedOn) : "ainda não houve"}
          </p>
          <ScopeChips scopes={k.scopes} />
          {readOnly ? null : <KeyActions k={k} />}
        </li>
      ))}
    </ul>
  );
}

/** Tabela de chaves (B2B02): "Produção", "Produção (anterior)" (em carência) e "Sandbox", como no design. Sem
 * `"use client"`: só exibe; `RotateDialog`/`RevokeButton` (client) cuidam da interação de cada linha. */
export function KeyTable({ keys, readOnly }: { keys: readonly KeyRow[]; readOnly: boolean }) {
  if (keys.length === 0) {
    return (
      <p className="text-texto-2 rounded-[20px] bg-white p-6 text-[15px] font-bold">
        Nenhuma chave ainda.
      </p>
    );
  }
  return (
    <>
      <KeyCards keys={keys} readOnly={readOnly} />
      <div
        className="hidden overflow-x-auto rounded-[20px] bg-white md:block"
        tabIndex={0}
        role="region"
        aria-label="Tabela (role para o lado para ver todas as colunas)"
      >
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
                    <KeyActions k={k} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
