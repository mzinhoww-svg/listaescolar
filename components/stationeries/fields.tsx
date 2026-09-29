export { Field, fieldInputClass as inputClass } from "@/components/ui/Field";

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
