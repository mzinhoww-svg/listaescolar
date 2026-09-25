"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string };

export function NavLinks({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();
  // O item mais específico que casa com a rota fica ativo.
  const active = [...items]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))?.href;
  return (
    <nav aria-label="Navegação" className="flex flex-row gap-1 overflow-x-auto md:flex-col">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.href === active ? "page" : undefined}
          className={`rounded-campo px-3.5 py-2.5 text-[15px] font-bold whitespace-nowrap ${
            i.href === active ? "bg-white/10 text-white" : "text-white/70 hover:text-white"
          }`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
