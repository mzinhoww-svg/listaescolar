// @vitest-environment node
import { describe, expect, it } from "vitest";

import { assertSafeTarget, parseArgs, reportPath, STAGING_REF } from "@/scripts/import-inep-lib";

describe("parseArgs", () => {
  it("lê arquivo e flags", () => {
    expect(parseArgs(["a.csv", "--demo"])).toEqual({ file: "a.csv", demo: true, allowProduction: false });
    expect(parseArgs(["--i-know-this-is-production", "b.csv"])).toEqual({
      file: "b.csv",
      demo: false,
      allowProduction: true,
    });
  });
  it("recusa sem arquivo, com dois arquivos ou flag desconhecida", () => {
    expect(() => parseArgs([])).toThrow(/uso/i);
    expect(() => parseArgs(["a.csv", "b.csv"])).toThrow(/uso/i);
    expect(() => parseArgs(["a.csv", "--x"])).toThrow(/desconhecida/i);
  });
});

describe("assertSafeTarget", () => {
  const flags = { allowProduction: false };
  it("aceita loopback e o ref de staging", () => {
    for (const url of ["http://127.0.0.1:54421", "http://localhost:54321", "http://[::1]:54321", `https://${STAGING_REF}.supabase.co`]) {
      expect(() => assertSafeTarget(url, flags)).not.toThrow();
    }
  });
  it("recusa qualquer outro host sem a flag, inclusive imitações do ref", () => {
    for (const url of [
      "https://abcdefghijklmnopqrst.supabase.co",
      `https://${STAGING_REF}.supabase.co.evil.com`,
      `https://evil.com/${STAGING_REF}`,
      `https://x-${STAGING_REF}.supabase.co`,
    ]) {
      expect(() => assertSafeTarget(url, flags)).toThrow(/i-know-this-is-production/);
    }
  });
  it("com a flag aceita outro host; URL inválida sempre falha", () => {
    expect(() => assertSafeTarget("https://abcdefghijklmnopqrst.supabase.co", { allowProduction: true })).not.toThrow();
    expect(() => assertSafeTarget("nao-e-url", { allowProduction: true })).toThrow(/inválida/i);
  });
});

describe("reportPath", () => {
  it("monta nome seguro no diretório dado", () => {
    expect(reportPath("/tmp", "0b1c-../x")).toBe("/tmp/erros-importacao-0b1c-x.csv");
  });
});
