import Link from "next/link";

import { outlineButton, primaryButton, Screen } from "@/components/auth/Screen";

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <Screen>
      <div className="flex flex-1 flex-col gap-3.5">
        <div className="flex-1" />
        <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em]">{title}</h1>
        <p className="text-texto-2 text-[15px] leading-[1.4] font-medium">{text}</p>
        <div className="flex-1" />
        <Link href="/" className={primaryButton}>
          Ir para o início
        </Link>
      </div>
    </Screen>
  );
}

export function BackHeader({ href, title }: { href: string; title: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Link
        href={href}
        aria-label="Voltar"
        className="bg-campo flex size-12 shrink-0 items-center justify-center rounded-full"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#0F1B2D"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </Link>
      <p className="text-base font-bold">{title}</p>
      <div className="w-12" />
    </div>
  );
}

export { outlineButton, primaryButton };
