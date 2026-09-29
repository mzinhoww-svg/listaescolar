// Receptor LOCAL que finge ser o PostHog no E2E da S28 (loopback; só com APP_ENV=local). Grava um NDJSON com cada
// requisição recebida (caminho, corpo e se veio cookie) e limpa o log em GET /control/reset.
import { appendFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";

const PORT = Number(process.argv[2] ?? 54999);
const LOG = process.argv[3] ?? "/tmp/e2e-s28-posthog.ndjson";
writeFileSync(LOG, "");

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
    appendFileSync(LOG, JSON.stringify({ url: req.url, method: req.method, hasCookie: Boolean(req.headers.cookie), body }) + "\n");
    res.writeHead(200, { "content-type": "application/json" }).end('{"status":1}');
  });
}).listen(PORT, "127.0.0.1");
