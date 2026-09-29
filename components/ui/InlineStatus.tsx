import type { ReactNode } from "react";

export type InlineStatusTone = "success" | "error" | "info";

const TONE: Record<InlineStatusTone, string> = {
  success: "text-verde-fundo",
  error: "bg-erro-fundo text-erro-texto rounded-campo px-3 py-2",
  info: "text-texto-2",
};

/** Feedback em linha junto da ação (DESIGN.md, Feedback). Erro é `alert`; sucesso e info são `status` (polite). */
export function InlineStatus({
  tone,
  children,
  className = "",
}: {
  tone: InlineStatusTone;
  children: ReactNode;
  className?: string;
}) {
  const role = tone === "error" ? "alert" : "status";
  return (
    <p role={role} className={`text-sm font-semibold ${TONE[tone]} ${className}`.trim()}>
      {children}
    </p>
  );
}
