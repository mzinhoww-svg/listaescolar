"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";

/**
 * Aviso discreto de medição de uso. É uma sobreposição FIXA NO TOPO, fora do fluxo: não reserva nem empurra conteúdo (sem
 * mudança de layout quando aparece depois do `requestIdleCallback`, CLS 0) e não deixa a tela de 100dvh mais alta que a janela.
 * Fica no topo e não no rodapé para não cobrir ações fixas de baixo (ex.: "Começar" da pesquisa, "Montar carrinho").
 * Entra só com opacidade e `transform` (S29 T10). Nada é enviado antes da escolha; recusar não tira nenhuma função do site.
 * Aceitar e Recusar têm o mesmo peso visual.
 */
export function ConsentNotice({ onAccept, onDeny }: { onAccept: () => void; onDeny: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState("");

  // Enquanto o aviso está aberto, `scroll-padding-top` de `html` = altura medida dele, para o foco por teclado não ficar
  // escondido atrás dele (WCAG 2.2, 2.4.11). Sai quando o aviso fecha. Também anuncia o aviso sem mover o foco.
  useEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    const apply = () => {
      if (el) root.style.scrollPaddingTop = `${Math.ceil(el.getBoundingClientRect().height)}px`;
    };
    apply();
    const observer = typeof ResizeObserver === "function" && el ? new ResizeObserver(apply) : null;
    if (observer && el) observer.observe(el);
    // O texto entra depois da montagem: leitor de tela só anuncia o que muda numa região `status` que já existe.
    const timer = setTimeout(() => setAnnouncement("Aviso sobre a medição de uso do site. Escolha Aceitar ou Recusar."), 50);
    return () => {
      clearTimeout(timer);
      observer?.disconnect();
      root.style.removeProperty("scroll-padding-top");
    };
  }, []);

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <div ref={ref} role="region" aria-label="Medição de uso" className="border-linha bg-papel fixed inset-x-0 top-0 z-40 border-b px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 motion-safe:animate-[offline-in_var(--mov-base)_ease-out]">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center">
          <p className="text-texto-2 flex-1 text-[14px] leading-snug font-medium">
            Podemos medir como o site é usado, sem usar seu nome, e-mail ou telefone, para melhorar as listas. Nada é enviado antes da sua escolha.{" "}
            <Link href="/privacidade" className="text-verde-fundo font-bold underline">
              Saiba mais
            </Link>
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={onAccept}>
              Aceitar
            </Button>
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={onDeny}>
              Recusar
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
