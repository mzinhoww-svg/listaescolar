// Receptor LOCAL que finge ser o PostHog no E2E da S28 (loopback; só com APP_ENV=local). Grava um NDJSON com cada
// requisição recebida (caminho, corpo, se veio cookie e os cabeçalhos que identificam o usuário) e limpa o log em GET /control/reset.
import { appendFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";

const PORT = Number(process.argv[2] ?? 54999);
const LOG = process.argv[3] ?? "/tmp/e2e-s28-posthog.ndjson";
writeFileSync(LOG, "");

// Cabeçalhos que NÃO podem chegar do usuário (revisão de segurança PostHog): registra o valor de cada um e a lista dos nomes.
const WATCH = ["cookie", "referer", "origin", "authorization", "x-forwarded-for", "x-real-ip", "user-agent"];
const pick = (h) => ({ names: Object.keys(h).sort(), ...Object.fromEntries(WATCH.filter((k) => h[k] !== undefined).map((k) => [k, String(h[k])])) });

createServer((req, res) => {
  if (req.url === "/control/reset") {
    writeFileSync(LOG, "");
    res.writeHead(200).end("ok");
    return;
  }
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    let body = null;
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
    appendFileSync(LOG, JSON.stringify({ url: req.url, method: req.method, hasCookie: Boolean(req.headers.cookie), headers: pick(req.headers), body }) + "\n");
    res.writeHead(200, { "content-type": "application/json" }).end('{"status":1}');
  });
}).listen(PORT, "127.0.0.1");
