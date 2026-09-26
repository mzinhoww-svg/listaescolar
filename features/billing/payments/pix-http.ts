import { request } from "node:https";
import { URL } from "node:url";

// node:https direto (sem dependência nova): a API Pix v2 do BACEN exige mTLS (certificado + chave do cliente) tanto
// no token OAuth2 quanto nas chamadas de cobrança. NUNCA logar corpo, cabeçalho, certificado, chave nem segredo.

export type HttpResponse = { status: number; body: string };
export type HttpRequestInit = { method: string; headers?: Record<string, string>; body?: string; cert?: string; key?: string };
export type HttpClient = (url: string, init: HttpRequestInit) => Promise<HttpResponse>;

/** Erro de chamada ao PSP: `transient` (5xx, timeout, rede) pode ser tentado de novo; permanente (4xx) não. */
export class PixHttpError extends Error {
  constructor(
    message: string,
    readonly transient: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PixHttpError";
  }
}

/** Cliente real (mTLS via `node:https`). Timeout curto: falha transitória, nunca trava a requisição do app. */
export const httpsJsonClient: HttpClient = (url, init) =>
  new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = request(
      {
        hostname: u.hostname,
        port: u.port ? Number(u.port) : 443,
        path: `${u.pathname}${u.search}`,
        method: init.method,
        headers: init.headers,
        cert: init.cert,
        key: init.key,
        timeout: 10_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("timeout", () => req.destroy(new PixHttpError("tempo esgotado ao chamar o PSP", true)));
    req.on("error", (err) => reject(err instanceof PixHttpError ? err : new PixHttpError("falha de rede ao chamar o PSP", true)));
    if (init.body) req.write(init.body);
    req.end();
  });
