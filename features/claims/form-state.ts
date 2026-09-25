/** Estado devolvido pelas Server Actions de reivindicação (formulários com `useActionState`). */
export type ClaimActionState =
  | { status: "idle" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string; errors: Record<string, string> };

export const IDLE: ClaimActionState = { status: "idle" };
export const ok = (message: string): ClaimActionState => ({ status: "ok", message });
export const failed = (message: string, errors: Record<string, string> = {}): ClaimActionState => ({ status: "error", message, errors });
