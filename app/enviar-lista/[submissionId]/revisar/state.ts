// Estado devolvido por saveParentCopyAction (useActionState). Só textos fixos.
export type ParentCopyState = { kind: "idle" | "saved" | "stale" | "error"; message: string; /** Versão da cópia depois de salvar. */ version?: number };
export const PARENT_IDLE: ParentCopyState = { kind: "idle", message: "" };
