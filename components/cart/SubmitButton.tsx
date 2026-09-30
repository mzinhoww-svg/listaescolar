"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/Button";

/**
 * Botão de envio do formulário: com a Server Action em andamento fica desabilitado, anuncia o carregamento (`aria-busy`) e
 * mantém a largura. O rótulo de carregamento vai para leitores de tela; o botão não troca de texto (sem salto de layout).
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "md",
  className = "",
  disabled = false,
  describedBy,
}: {
  children: ReactNode;
  pendingLabel: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  disabled?: boolean;
  describedBy?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} className={className} loading={pending} disabled={disabled} aria-describedby={describedBy}>
      {children}
      {pending ? <span className="sr-only">{pendingLabel}</span> : null}
    </Button>
  );
}
