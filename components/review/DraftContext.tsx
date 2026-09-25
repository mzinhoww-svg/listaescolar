"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type Draft = { dirty: boolean; setDirty: (v: boolean) => void };
const Ctx = createContext<Draft>({ dirty: false, setDirty: () => undefined });

/** Liga o editor (rascunho) ao painel de decisão: com edição não salva, aprovar fica bloqueado. */
export function DraftProvider({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState(false);
  const value = useMemo(() => ({ dirty, setDirty }), [dirty]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useDraft = (): Draft => useContext(Ctx);
