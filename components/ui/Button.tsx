import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "outline" | "danger" | "whatsapp";
export type ButtonSize = "md" | "lg";

const BASE =
  "rounded-botao inline-flex shrink-0 items-center justify-center gap-2 px-6 text-base font-extrabold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-verde-fundo disabled:opacity-50";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-tinta text-papel",
  outline: "border-[1.5px] border-tinta bg-transparent text-tinta",
  danger: "border-[1.5px] border-erro-texto bg-transparent text-erro-texto",
  // Verde Certo com texto Tinta (8,2:1). O foco sobre esse fundo continua em Verde Fundo, pois a página é clara.
  whatsapp: "bg-verde-certo text-tinta",
};

// 48 px é o piso de ação no celular; `lg` (56 px) é o primário de tela (DESIGN.md, seção 3).
const SIZE: Record<ButtonSize, string> = { md: "h-12", lg: "h-14" };

/** Classes do botão para quem precisa aplicá-las a um `<Link>` ou `<a>`. */
export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra = ""): string {
  return `${BASE} ${VARIANT[variant]} ${SIZE[size]} ${extra}`.trim();
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize };

/** Botão do sistema (DESIGN.md, seção 4). `type="button"` por padrão: enviar formulário é sempre explícito. */
export function Button({ variant = "primary", size = "md", className = "", type = "button", ...rest }: Props) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />;
}
