"use client";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { revokeKeyAction } from "@/features/b2b/actions";

// "Revogar" (B2B02): confirmação com o aviso do design ("A chave para de funcionar imediatamente"). Sem texto de
// chave nenhum aqui, só o `keyId`.

export function RevokeButton({ keyId }: { keyId: string }) {
  return (
    <ConfirmDialog
      triggerLabel="Revogar"
      title="Revogar chave"
      body="A chave para de funcionar imediatamente. Esta ação não pode ser desfeita."
      confirmLabel="Revogar agora"
      pendingLabel="Revogando..."
      onConfirm={async () => {
        const r = await revokeKeyAction({ keyId });
        return r.ok ? { ok: true } : { ok: false, message: r.message };
      }}
    />
  );
}
