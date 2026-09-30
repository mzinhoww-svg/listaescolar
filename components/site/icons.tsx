/** Ícones do site público (decorativos; o texto ao lado carrega o sentido). */
export function CheckBadge({ dark = false, size = 32 }: { dark?: boolean; size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 32 32" className="shrink-0">
      <rect width="32" height="32" rx="8" className={dark ? "fill-papel" : "fill-verde-certo"} />
      <path d="M9 16.5l4.5 4.5L23 11.5" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="stroke-tinta" />
    </svg>
  );
}

/** Caixa vazia (nada marcado): o cartão de exemplo não mostra item "resolvido", só a lista. */
export function EmptyBox() {
  return (
    <svg aria-hidden width="20" height="20" viewBox="0 0 20 20" className="shrink-0">
      <rect x="1" y="1" width="18" height="18" rx="5" fill="none" strokeWidth="1.5" className="stroke-tinta/50" />
    </svg>
  );
}

export function MailIcon() {
  return (
    <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-verde-fundo shrink-0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M4 7l8 6 8-6" />
    </svg>
  );
}

export function ArrowRight() {
  return (
    <svg aria-hidden width="64" height="24" viewBox="0 0 64 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-tinta">
      <path d="M4 12h54M48 3l10 9-10 9" />
    </svg>
  );
}
