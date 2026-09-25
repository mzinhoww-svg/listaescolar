const DELAYS_MS = [1000, 3000, 9000];

/**
 * Envia um POST JSON com até 3 tentativas (backoff 1s/3s/9s). Nunca lança: em falha
 * final, chama `onFalhaFinal` (para um aviso discreto) e retorna sem bloquear a UI.
 * Resposta 4xx é falha definitiva na hora: repetir a mesma requisição inválida só
 * atrasaria o aviso (13 s) sem chance de sucesso.
 */
export async function enviarComRetry(
  url: string,
  body: unknown,
  onFalhaFinal?: () => void,
): Promise<void> {
  for (let tentativa = 0; tentativa <= DELAYS_MS.length; tentativa++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return;
      if (res.status >= 400 && res.status < 500) break;
    } catch {
      // rede indisponível: tenta de novo conforme o backoff
    }
    if (tentativa < DELAYS_MS.length) {
      await new Promise((resolve) => setTimeout(resolve, DELAYS_MS[tentativa]));
    }
  }
  onFalhaFinal?.();
}
