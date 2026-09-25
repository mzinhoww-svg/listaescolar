#!/usr/bin/env node
// Gera um par VAPID de DESENVOLVIMENTO e o grava no arquivo local (padrão .env.local, ignorado pelo git). Nunca imprime a chave
// privada. Recusa produção. Idempotente: se já houver VAPID_PRIVATE_KEY preenchida, não troca.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import webpush from "web-push";

if ((process.env.APP_ENV ?? "") === "production" || (process.env.VERCEL_ENV ?? "") === "production") {
  console.error("vapid-dev: recusado em produção (a chave real é do humano).");
  process.exit(1);
}
const file = process.env.VAPID_ENV_FILE || ".env.local";
const text = existsSync(file) ? readFileSync(file, "utf8") : "";
if (/^VAPID_PRIVATE_KEY=\S+/m.test(text)) {
  console.log(`vapid-dev: já existe um par em ${file}; nada a fazer.`);
  process.exit(0);
}
const keys = webpush.generateVAPIDKeys();
const drop = (t, name) => t.replace(new RegExp(`^${name}=.*\\n?`, "m"), "");
let out = text;
for (const n of ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"]) out = drop(out, n);
if (out && !out.endsWith("\n")) out += "\n";
out += `NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`;
if (!/^VAPID_SUBJECT=\S+/m.test(out)) out += "VAPID_SUBJECT=mailto:dev@listacerta.invalid\n";
writeFileSync(file, out, { mode: 0o600 });
console.log(`vapid-dev: par de desenvolvimento gravado em ${file} (chave privada não exibida).`);
