"use client";

import type { ClaimActionState } from "@/features/claims/form-state";

import { ActionForm } from "./ActionForm";

/** Página do link do e-mail: o GET só mostra o botão; quem consome o token é a Server Action (scanners não consomem). */
export function ConfirmEmailPanel({ inep, token, confirm }: { inep: string; token: string; confirm: (p: ClaimActionState, f: FormData) => Promise<ClaimActionState> }) {
  return (
    <ActionForm action={confirm} submitLabel="Confirmar e-mail da escola" pendingLabel="Confirmando...">
      <input type="hidden" name="inep" value={inep} />
      <input type="hidden" name="channel" value="email" />
      <input type="hidden" name="token" value={token} />
    </ActionForm>
  );
}
