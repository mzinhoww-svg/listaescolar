import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Varredura estática (S21, Global Constraints): nenhum PEM, `client_secret` literal nem chave Pix no repositório
// (fora dos testes, que usam valores obviamente falsos com `.example.invalid`/`fake`); `PixPaymentProvider` só
// importado pela fábrica (`payments/factory.ts`).

const ROOT = join(__dirname, "..", "..");

function listFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".track-workdir") continue;
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) listFiles(full, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("varredura de segredos e credenciais (S21)", () => {
  it("nenhum PEM real, client_secret literal ou chave Pix fora de tests/", () => {
    const offenders: string[] = [];
    for (const file of listFiles(join(ROOT, "app")).concat(listFiles(join(ROOT, "features")), listFiles(join(ROOT, "lib")))) {
      const text = readFileSync(file, "utf8");
      if (/-----BEGIN (CERTIFICATE|PRIVATE KEY|RSA PRIVATE KEY)-----/.test(text)) offenders.push(`${file}: PEM literal`);
      if (/client_secret\s*[:=]\s*["'][^"']{8,}["']/i.test(text)) offenders.push(`${file}: client_secret literal`);
    }
    expect(offenders).toEqual([]);
  });

  it("PixPaymentProvider só é importado pela fábrica (payments/factory.ts)", () => {
    const importers: string[] = [];
    for (const file of listFiles(join(ROOT, "app")).concat(listFiles(join(ROOT, "features")))) {
      if (file.endsWith(join("payments", "pix.ts")) || file.endsWith(join("payments", "factory.ts")) || file.includes(`${join("tests", "")}`)) continue;
      const text = readFileSync(file, "utf8");
      if (/from ["'].*\/payments\/pix["']/.test(text) || /PixPaymentProvider/.test(text)) importers.push(file);
    }
    expect(importers).toEqual([]);
  });
});
