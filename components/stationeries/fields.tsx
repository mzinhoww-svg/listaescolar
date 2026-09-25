import type { ReactNode } from "react";

export const inputClass =
  "bg-campo text-tinta h-[52px] w-full rounded-campo px-4 text-[15px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-verde-fundo aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-red-700";

export function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[14px] font-extrabold">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-verde-fundo text-[12px] font-semibold">{hint}</p> : null}
      {error ? (
        <p id={`${id}-erro`} role="alert" className="text-[13px] font-semibold text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Chip de escolha (checkbox nativo, acessível por teclado) no estilo das telas: verde quando marcado. */
export function Chip({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string;
  value?: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="bg-campo has-[:checked]:bg-verde-certo has-[:checked]:ring-tinta has-[:focus-visible]:ring-2 cursor-pointer rounded-botao px-4 py-2.5 text-[14px] font-extrabold has-[:checked]:ring-[1.5px]">
      <input type="checkbox" name={name} value={value ?? "on"} defaultChecked={defaultChecked} className="sr-only" />
      {label}
    </label>
  );
}
