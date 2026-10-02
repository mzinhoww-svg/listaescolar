import type { ReactNode } from "react";

/**
 * Campo: fundo Campo com borda de 1,5 px em `texto-3` (5,3:1 contra o Papel; limite ≥ 3:1, WCAG 1.4.11), foco em
 * Verde Fundo e erro em `erro-texto`. Antes o campo não tinha borda (1,06:1 contra o fundo, divergência D-04).
 */
export const fieldInputClass =
  "bg-campo text-tinta border-texto-3 h-[52px] w-full rounded-campo border-[1.5px] px-4 text-[15px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-verde-fundo aria-[invalid=true]:border-erro-texto aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-erro-texto";

type Props = {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string;
  children: ReactNode;
};

/** Rótulo sempre visível e associado (`htmlFor`), dica e erro junto do campo. O input filho usa `id` e `aria-describedby={`${id}-erro`}`. */
export function Field({ id, label, error, hint, children }: Props) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[14px] font-extrabold">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-texto-2 text-[13px] font-semibold">{hint}</p> : null}
      {error ? (
        <p id={`${id}-erro`} role="alert" className="text-erro-texto text-[13px] font-semibold">
          {error}
        </p>
      ) : null}
    </div>
  );
}
