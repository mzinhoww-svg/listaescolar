import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "outline" | "text" | "danger" | "icon" | "whatsapp";
export type ButtonSize = "md" | "lg";

const BASE =
  "rounded-botao inline-flex shrink-0 items-center justify-center gap-2 text-base font-extrabold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-verde-fundo disabled:opacity-50";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-tinta px-6 text-papel",
  outline: "border-[1.5px] border-tinta bg-transparent px-6 text-tinta",
  // Terciário: sem contorno nem fundo; alvo mínimo de 44 px (DESIGN.md, seção 3).
  text: "bg-transparent text-tinta underline-offset-4 hover:underline min-h-11 px-2",
  // Só ícone: 44 x 44 px, sem padding lateral. Exige `aria-label`.
  icon: "h-11 w-11 p-0 px-0 bg-transparent text-tinta",
  danger: "border-[1.5px] border-erro-texto bg-transparent px-6 text-erro-texto",
  // Verde Certo com texto Tinta (8,2:1). O foco sobre esse fundo continua em Verde Fundo, pois a página é clara.
  whatsapp: "bg-verde-certo px-6 text-tinta",
};

// 48 px é o piso de ação no celular; `lg` (56 px) é o primário de tela (DESIGN.md, seção 3).
const SIZE: Record<ButtonSize, string> = { md: "h-12", lg: "h-14" };

/** Classes do botão para quem precisa aplicá-las a um `<Link>` ou `<a>`. */
export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra = ""): string {
  // `text` e `icon` trazem a própria altura (44 px); `size` não se aplica a eles.
  const height = variant === "text" || variant === "icon" ? "" : SIZE[size];
  return `${BASE} ${VARIANT[variant]} ${height} ${extra}`.replace(/\s+/g, " ").trim();
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Ação em andamento: desabilita, anuncia (`aria-busy`) e mantém a largura (o conteúdo continua renderizado). */
  loading?: boolean;
};

/** Botão do sistema (DESIGN.md, seção 4). `type="button"` por padrão: enviar formulário é sempre explícito. */
export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  loading = false,
  disabled,
  children,
  ...rest
}: Props) {
  if (process.env.NODE_ENV !== "production" && variant === "icon" && !rest["aria-label"] && !rest["aria-labelledby"]) {
    console.warn('Button variant="icon" precisa de aria-label: sem ele o botão não tem nome acessível.');
  }
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
      {...rest}
    >
      {children}
      {loading ? (
        <span
          aria-hidden="true"
          className="size-4 shrink-0 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
        />
      ) : null}
    </button>
  );
}
