import { AdminNav } from "@/components/admin/AdminNav";
import { Logo } from "@/components/brand/Logo";
import { SkipLink } from "@/components/site/SkipLink";

const NAV = [
  { href: "/admin", label: "Visão geral" },
  { href: "/admin/importacoes", label: "Importações" },
  { href: "/admin/reivindicacoes", label: "Reivindicações" },
  { href: "/admin/revisao", label: "Revisão" },
  { href: "/admin/papelarias", label: "Papelarias" },
  { href: "/admin/parceiros", label: "Parceiros B2B" },
  { href: "/admin/campanhas", label: "Campanhas B2B" },
  { href: "/admin/planos", label: "Planos e preços" },
  { href: "/admin/auditoria", label: "Auditoria de conversão" },
  { href: "/admin/contestacoes", label: "Contestações" },
  { href: "/admin/repasses", label: "Repasses" },
  { href: "/admin/inadimplencia", label: "Inadimplência" },
  { href: "/admin/denuncias", label: "Denúncias" },
  { href: "/admin/eventos", label: "Eventos (auditoria)" },
  { href: "/admin/ia", label: "Configuração de IA" },
] as const;

type Props = {
  active:
    | "/admin"
    | "/admin/importacoes"
    | "/admin/papelarias"
    | "/admin/reivindicacoes"
    | "/admin/revisao"
    | "/admin/parceiros"
    | "/admin/campanhas"
    | "/admin/planos"
    | "/admin/auditoria"
    | "/admin/contestacoes"
    | "/admin/repasses"
    | "/admin/inadimplencia"
    | "/admin/denuncias"
    | "/admin/eventos"
    | "/admin/ia"
    | "/admin/listas";
  /** `null`: esconde o rodapé de usuário (tela de carregamento, antes de saber quem é). */
  email: string | null | undefined;
  breadcrumb: string;
  title: string;
  /** Ações ao lado do título (busca, voltar). */
  actions?: React.ReactNode;
  children: React.ReactNode;
};

/** Casca do admin: barra lateral escura e área de conteúdo, como nas telas Admin02/03. */
export function AdminShell({ active, email, breadcrumb, title, actions, children }: Props) {
  const initials = (email ?? "?").slice(0, 2).toUpperCase();
  return (
    <div className="flex min-h-screen flex-1 flex-col md:flex-row">
      <SkipLink />
      <aside className="bg-tinta text-papel flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 md:w-[248px] md:flex-col md:items-stretch md:gap-6 md:px-6 md:py-7">
        <Logo variant="horizontal-negativo" height={36} />
        <span className="bg-verde-certo text-tinta w-fit rounded-botao px-3 py-0.5 text-xs font-extrabold">
          Admin interno
        </span>
        <AdminNav items={NAV} active={active} />
        {email === null ? null : (
          <div className="flex items-center gap-3 md:mt-auto">
            <span className="bg-verde-certo text-tinta flex size-10 items-center justify-center rounded-full text-xs font-extrabold">
              {initials}
            </span>
            <span className="truncate text-[13px]">{email ?? "indisponível"}</span>
          </div>
        )}
      </aside>
      <main id="conteudo" className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-6 md:px-10 md:py-9">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-texto-3 text-[13px] font-semibold">{breadcrumb}</p>
            <h1 className="text-[26px] leading-[1.1] md:text-[32px] font-extrabold tracking-[-0.035em]">{title}</h1>
          </div>
          {actions}
        </header>
        {children}
      </main>
    </div>
  );
}
