"use client";

/**
 * Erro no layout raiz (S29, UX-005). Substitui o documento inteiro, então não há `globals.css` nem fonte do tema: estilos
 * em linha com os tokens da marca (Tinta, Papel). Em português, com marca e a mesma saída do `error.tsx`.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  const botao = { display: "flex", alignItems: "center", justifyContent: "center", height: 52, borderRadius: 999, fontWeight: 800, fontSize: 16, textDecoration: "none", cursor: "pointer" } as const;
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: "#F5F2EA", color: "#0F1B2D", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: 420, margin: "0 auto", minHeight: "100dvh", padding: "56px 24px 36px", display: "flex", flexDirection: "column", gap: 14, boxSizing: "border-box" }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 18 }}>ListaCerta</p>
          <div style={{ flex: 1 }} />
          <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.1, fontWeight: 800 }}>Algo deu errado</h1>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.4, color: "#3A4658" }}>
            O que você já salvou continua salvo. O que estava sendo enviado agora pode não ter sido salvo: confira antes de repetir.
          </p>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={reset} style={{ ...botao, background: "#0F1B2D", color: "#F5F2EA", border: "none" }}>
            Tentar de novo
          </button>
          {/* Documento raiz substituído: recarga completa de propósito, sem depender do roteador do Next. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" style={{ ...botao, border: "1.5px solid #0F1B2D", color: "#0F1B2D" }}>
            Ir para o início
          </a>
        </main>
      </body>
    </html>
  );
}
