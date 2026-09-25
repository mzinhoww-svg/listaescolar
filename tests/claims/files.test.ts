import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { MAX_EVIDENCE_BYTES, sanitizeFileName, sniffEvidence } from "@/features/claims/files";

import { concat, enc, jpeg, pdf, png } from "../helpers/files";

describe("sniffEvidence", () => {
  it("PDF, PNG e JPEG válidos, com sha256 e extensão", () => {
    const p = pdf();
    expect(sniffEvidence(p, "application/pdf")).toEqual({ ok: true, mime: "application/pdf", ext: "pdf", size: p.length, sha256: createHash("sha256").update(p).digest("hex") });
    expect(sniffEvidence(png(), "image/png")).toMatchObject({ ok: true, ext: "png" });
    expect(sniffEvidence(jpeg(), "image/jpeg")).toMatchObject({ ok: true, ext: "jpg" });
  });
  it("MIME trocado é recusado, mesmo com bytes válidos de outro tipo", () => {
    expect(sniffEvidence(pdf(), "image/png")).toEqual({ ok: false, reason: "mime_mismatch" });
    expect(sniffEvidence(png(), "application/pdf")).toEqual({ ok: false, reason: "mime_mismatch" });
  });
  it("MIME declarado vazio vale pelos bytes; declarado não vazio e diferente é recusado", () => {
    expect(sniffEvidence(pdf(), "")).toMatchObject({ ok: true, mime: "application/pdf" });
    expect(sniffEvidence(png(), "")).toMatchObject({ ok: true, mime: "image/png" });
    expect(sniffEvidence(png(), "application/pdf")).toEqual({ ok: false, reason: "mime_mismatch" });
    expect(sniffEvidence(enc("<html>"), "")).toEqual({ ok: false, reason: "unsupported_type" });
  });
  it("tipo não suportado, vazio e HTML disfarçado", () => {
    expect(sniffEvidence(enc("<html><script>alert(1)</script>"), "application/pdf")).toEqual({ ok: false, reason: "unsupported_type" });
    expect(sniffEvidence(enc("GIF89a"), "image/gif")).toEqual({ ok: false, reason: "unsupported_type" });
    expect(sniffEvidence(new Uint8Array(0), "application/pdf")).toEqual({ ok: false, reason: "empty" });
  });
  it("4 MB passa; 4 MB + 1 não", () => {
    const at = concat(pdf(), new Uint8Array(MAX_EVIDENCE_BYTES - pdf().length));
    expect(at.length).toBe(MAX_EVIDENCE_BYTES);
    expect(sniffEvidence(at, "application/pdf").ok).toBe(true);
    expect(sniffEvidence(concat(at, new Uint8Array(1)), "application/pdf")).toEqual({ ok: false, reason: "too_large" });
  });
});

describe("sanitizeFileName", () => {
  it.each([
    ["../../etc/passwd", "passwd"],
    ["..\\..\\boot.ini", "boot.ini"],
    ["Certidão de Nomeação.pdf", "Certidao_de_Nomeacao.pdf"],
    ["a\u0000b\u001f\nc.pdf", "abc.pdf"],
    ["...oculto.png", "oculto.png"],
    ["", "documento"],
    ["////", "documento"],
    ["ação..pdf", "acao.pdf"],
  ])("%j -> %j", (input, out) => expect(sanitizeFileName(input)).toBe(out));
  it("limita a 120 caracteres e nunca deixa pasta ou espaço", () => {
    const r = sanitizeFileName(`${"a".repeat(200)}.pdf`);
    expect(r.length).toBeLessThanOrEqual(120);
    expect(sanitizeFileName("a b/c d.pdf")).toBe("c_d.pdf");
  });
});
