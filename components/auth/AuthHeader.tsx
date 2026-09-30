import Link from "next/link";

import { backFromLogin } from "@/features/auth/login-context";

/** Caminho de volta de `/entrar` (UX-041): à lista de origem quando o destino é público, senão ao início. */
export function AuthHeader({ next }: { next: string }) {
  const back = backFromLogin(next);
  return (
    <header className="-mt-2 flex items-center">
      <Link
        href={back.href}
        className="text-verde-fundo focus-visible:outline-verde-fundo -ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-botao px-2 text-[15px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        {back.label}
      </Link>
    </header>
  );
}
