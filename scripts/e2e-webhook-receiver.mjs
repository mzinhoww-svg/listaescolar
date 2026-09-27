// Receptor de webhook LOCAL para o E2E da S25 (loopback, só usado com APP_ENV=local, como a S11 já fazia para o
// receptor de Web Push de teste). Verifica a assinatura HMAC-SHA256 recebida (mesmo formato de
// `features/webhooks/sign.ts`, reimplementado aqui sem importar TS para manter o script em Node puro) e grava
// cada entrega recebida em NDJSON. `/control/fail` liga/desliga um modo que responde 500 (para exercitar
// retry/dead letter); `/control/reset` limpa o log.
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const PORT = Number(process.argv[2] ?? process.env.PORT ?? 3905);
const SECRET_FILE = process.argv[3] ?? "/tmp/e2e-s25-webhook-secret.txt";
const LOG_FILE = process.argv[4] ?? "/tmp/e2e-s25-webhook-log.ndjson";
let failing = false;

function currentSecret() {
  try {
    return readFileSync(SECRET_FILE, "utf8").trim();
  } catch {
    return "";
  }
}

function verify(secret, header, rawBody) {
  if (!secret || !header) return false;
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header);
  if (!m) return false;
  const expected = createHmac("sha256", secret).update(`${m[1]}.${rawBody}`, "utf8").digest("hex");
  const a = Buffer.from(m[2], "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

writeFileSync(LOG_FILE, "");

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/control/fail-on") {
    failing = true;
    res.writeHead(200).end("ok");
    return;
  }
  if (req.method === "GET" && req.url === "/control/fail-off") {
    failing = false;
    res.writeHead(200).end("ok");
    return;
  }
  if (req.method === "GET" && req.url === "/control/reset") {
    writeFileSync(LOG_FILE, "");
    res.writeHead(200).end("ok");
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(404).end();
    return;
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const signatureHeader = req.headers["x-listacerta-signature"];
    const secret = currentSecret();
    const validSignature = verify(secret, signatureHeader, body);
    appendFileSync(LOG_FILE, JSON.stringify({ receivedAt: new Date().toISOString(), validSignature, body: JSON.parse(body || "{}") }) + "\n");
    if (failing) {
      res.writeHead(500).end("forced failure");
      return;
    }
    res.writeHead(validSignature ? 200 : 401).end(validSignature ? "ok" : "invalid signature");
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`webhook receiver on http://127.0.0.1:${PORT}`);
});
