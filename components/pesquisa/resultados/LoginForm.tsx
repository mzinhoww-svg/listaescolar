"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Form de senha da página de resultados: POST /api/pesquisa/login -> cookie httpOnly. */
export function LoginForm() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/pesquisa/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ senha }),
      });
      if (res.status === 200) {
        router.push("/pesquisa/resultados");
        router.refresh();
        return;
      }
      if (res.status === 401) {
        setErro("Senha incorreta.");
        return;
      }
      setErro("Não foi possível entrar. Tente de novo.");
    } catch {
      setErro("Não foi possível entrar. Tente de novo.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-3">
      <label htmlFor="senha" className="text-texto-2 text-[13px] font-semibold">
        Senha
      </label>
      <input
        id="senha"
        name="senha"
        type="password"
        autoComplete="current-password"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        aria-invalid={erro !== null}
        aria-describedby={erro ? "senha-erro" : undefined}
        className="bg-campo text-tinta rounded-campo focus-visible:ring-verde-fundo h-[52px] w-full px-4 text-[15px] font-medium outline-none focus-visible:ring-2"
      />
      <button
        type="submit"
        disabled={carregando}
        className="bg-tinta text-papel rounded-botao flex h-14 w-full items-center justify-center text-base font-extrabold disabled:opacity-60"
      >
        {carregando ? "Entrando…" : "Entrar"}
      </button>
      <div aria-live="polite">
        {erro ? (
          <p id="senha-erro" role="alert" className="text-[13px] font-semibold text-red-700">
            {erro}
          </p>
        ) : null}
      </div>
    </form>
  );
}
