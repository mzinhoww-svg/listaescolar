/** Trava de segurança dos scripts de medição: só falam com 127.0.0.1 ou localhost (nunca staging/produção). */
export function isLocalUrl(value) {
  try {
    const { hostname, protocol } = new URL(value);
    return (protocol === "http:" || protocol === "https:") && (hostname === "127.0.0.1" || hostname === "localhost");
  } catch {
    return false;
  }
}

/** Aborta (lança) se alguma URL não for local. `entries` = { NOME: url }. */
export function assertLocalUrls(entries) {
  for (const [name, value] of Object.entries(entries)) {
    if (!isLocalUrl(value)) throw new Error(`${name}=${value} não é local: estes scripts só rodam contra 127.0.0.1 ou localhost.`);
  }
}
