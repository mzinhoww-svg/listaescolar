import { KeyMask } from "@/components/b2b/KeyMask";
import { KeyStatusBadge } from "@/components/b2b/StatusBadge";
import { ScopeChips } from "@/components/b2b/ScopeChips";
import type { PartnerOverview } from "@/features/b2b/repository";

import { adminRevokeKeyAction } from "../actions";

type KeyRow = PartnerOverview["keys"][number];

/** Chaves mascaradas do parceiro, com "Revogar" (Admin15). Formulário simples (sem diálogo): o admin já está numa
 * tela de gestão, o pedido de confirmação do dono (RevokeButton) seria redundante aqui. */
export function KeyList({ partnerId, keys }: { partnerId: string; keys: readonly KeyRow[] }) {
  if (keys.length === 0) return <p className="text-texto-2 rounded-[20px] bg-white p-5 text-[14px] font-bold">Nenhuma chave ainda.</p>;
  return (
    <div className="flex flex-col gap-2">
      {keys.map((k) => (
        <div key={k.id} className="flex flex-wrap items-center gap-3 rounded-[16px] bg-white p-4">
          <span className="bg-campo text-texto-2 rounded-botao px-2.5 py-1 text-[11px] font-extrabold">{k.environment === "live" ? "Produção" : "Sandbox"}</span>
          <KeyMask environment={k.environment} last4={k.last4} />
          <ScopeChips scopes={k.scopes} />
          <KeyStatusBadge status={k.status} expiresAt={k.expiresAt} />
          {k.status === "active" ? (
            <form action={adminRevokeKeyAction} className="ml-auto flex items-center gap-2">
              <input type="hidden" name="partnerId" value={partnerId} />
              <input type="hidden" name="keyId" value={k.id} />
              <input type="hidden" name="reason" value="revogada pelo admin" />
              <button type="submit" className="text-[13px] font-extrabold text-[#8a1c14] underline">
                Revogar
              </button>
            </form>
          ) : null}
        </div>
      ))}
    </div>
  );
}
