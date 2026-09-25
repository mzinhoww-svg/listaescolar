import { describe, expect, it } from "vitest";

import { checkUploadSize, sanitizeFileName, validateUpload } from "@/features/submissions/file-validation";
import { encryptedPdf, enc, exe, heic, jpeg, pdf, png, truncatedPdf, webp } from "../helpers/files";

const file = (bytes: Uint8Array, declaredMime: string, name = "lista.pdf") => ({
  name,
  declaredMime,
  size: bytes.length,
  bytes,
});

describe("validateUpload", () => {
  it.each([
    ["pdf", pdf(), "application/pdf"],
    ["png", png(), "image/png"],
    ["jpeg", jpeg(), "image/jpeg"],
    ["webp", webp(), "image/webp"],
    ["heic", heic(), "image/heic"],
  ])("aceita %s válido", (_n, bytes, mime) => {
    expect(validateUpload(file(bytes, mime))).toEqual({ ok: true, mime });
  });

  it("aceita Content-Type vazio (câmera) e alias heif, pelo conteúdo", () => {
    expect(validateUpload(file(png(), ""))).toEqual({ ok: true, mime: "image/png" });
    expect(validateUpload(file(heic(), "image/heif"))).toEqual({ ok: true, mime: "image/heic" });
  });

  const rejected: [string, ReturnType<typeof file>, string][] = [
    ["exe renomeado para .pdf com tipo pdf", file(exe(), "application/pdf", "lista.pdf"), "unsupported_type"],
    ["png declarado como pdf", file(png(), "application/pdf"), "signature_mismatch"],
    ["pdf declarado como jpeg", file(pdf(), "image/jpeg"), "signature_mismatch"],
    ["tipo fora da lista (gif)", file(enc("GIF89a...."), "image/gif"), "unsupported_type"],
    ["0 bytes", { name: "a.pdf", declaredMime: "application/pdf", size: 0, bytes: new Uint8Array(0) }, "empty_file"],
    ["mais de 10 MB", { name: "a.pdf", declaredMime: "application/pdf", size: 10 * 1024 * 1024 + 1, bytes: pdf() }, "file_too_large"],
    ["pdf criptografado", file(encryptedPdf(), "application/pdf"), "encrypted_pdf"],
    ["pdf truncado/corrompido", file(truncatedPdf(), "application/pdf"), "corrupt_file"],
    ["png gigante (30000 x 30000)", file(png(30000, 30000), "image/png"), "image_too_large"],
    ["jpeg gigante", file(jpeg(20000, 20000), "image/jpeg"), "image_too_large"],
    ["png sem IHDR", file(png().slice(0, 12), "image/png"), "corrupt_file"],
    ["png com dimensão zero", file(png(0, 10), "image/png"), "corrupt_file"],
  ];
  it.each(rejected)("recusa: %s", (_n, f, code) => {
    expect(validateUpload(f)).toEqual({ ok: false, code });
  });

  it("poliglota: vale o que o conteúdo diz (o primeiro tipo reconhecido), não o que vem depois", () => {
    const tail = new TextEncoder().encode("\n%%EOF");
    const concat = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((p) => [...p]));
    // PDF que carrega uma PNG dentro: é PDF, e declarar image/png é assinatura mentirosa
    const pdfWithPng = concat(pdf(), png(10, 10), tail);
    expect(validateUpload(file(pdfWithPng, "application/pdf"))).toEqual({ ok: true, mime: "application/pdf" });
    expect(validateUpload(file(pdfWithPng, "image/png"))).toEqual({ ok: false, code: "signature_mismatch" });
    // PNG com um PDF anexado ao final: é PNG
    const pngWithPdf = concat(png(10, 10), pdf());
    expect(validateUpload(file(pngWithPdf, "image/png"))).toEqual({ ok: true, mime: "image/png" });
    expect(validateUpload(file(pngWithPdf, "application/pdf"))).toEqual({ ok: false, code: "signature_mismatch" });
    // executável com cabeçalho PDF depois de bytes de MZ: não é reconhecido
    expect(validateUpload(file(concat(exe(), pdf()), "application/pdf"))).toEqual({ ok: false, code: "unsupported_type" });
  });

  it("checkUploadSize barra antes de ler o conteúdo", () => {
    expect(checkUploadSize(0)).toEqual({ ok: false, code: "empty_file" });
    expect(checkUploadSize(11 * 1024 * 1024)).toEqual({ ok: false, code: "file_too_large" });
    expect(checkUploadSize(1000)).toBeNull();
  });
});

describe("sanitizeFileName", () => {
  it.each([
    ["../../etc/passwd", "passwd.pdf"],
    ["C:\\Users\\x\\lista.pdf", "lista.pdf"],
    ["li\u0000sta\u0007.pdf", "lista.pdf"],
    ["..", "arquivo.pdf"],
    ["", "arquivo.pdf"],
    ["lista 3º ano.pdf", "lista 3_ ano.pdf"],
    ["Relação de Matérias.pdf", "Relacao de Materias.pdf"],
    ["a..b.pdf", "a.b.pdf"],
    ["semextensao", "semextensao.pdf"],
  ])("%j -> %j", (input, expected) => {
    expect(sanitizeFileName(input, "application/pdf")).toBe(expected);
  });

  it("extensão forçada pelo tipo detectado, não pelo nome enviado", () => {
    expect(sanitizeFileName("lista.exe", "application/pdf")).toBe("lista.pdf");
    expect(sanitizeFileName("lista.PNG", "application/pdf")).toBe("lista.pdf");
    expect(sanitizeFileName("foto.pdf", "image/jpeg")).toBe("foto.jpg");
    expect(sanitizeFileName("foto.jpeg", "image/jpeg")).toBe("foto.jpeg");
    expect(sanitizeFileName("IMG.HEIF", "image/heic")).toBe("IMG.HEIF");
    expect(sanitizeFileName("a.php.pdf", "application/pdf")).toBe("a.php.pdf");
    expect(sanitizeFileName("a.pdf.exe", "application/pdf")).toBe("a.pdf");
    expect(sanitizeFileName(".pdf", "image/png")).toBe("pdf.png");
  });

  it("nunca devolve separador, .. ou controle e limita o tamanho", () => {
    const out = sanitizeFileName(`${"a".repeat(400)}/../x\n.pdf`, "application/pdf");
    expect(out.length).toBeLessThanOrEqual(124);
    expect(out).not.toMatch(/[/\\]|\.\.|[\u0000-\u001f]/);
  });
});
