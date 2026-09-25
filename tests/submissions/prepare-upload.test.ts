import { describe, expect, it, vi } from "vitest";

import {
  COMPRESS_MAX_SIDE_PX,
  COMPRESS_QUALITY,
  COMPRESS_THRESHOLD_BYTES,
  prepareUpload,
  scaledSize,
} from "@/components/submissions/prepareUpload";
import { MAX_UPLOAD_BYTES } from "@/features/submissions/constants";
import { ERROR_MESSAGES } from "@/features/submissions/copy";

const fakeFile = (name: string, type: string, size: number) => {
  const f = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};
const blobOf = (size: number) => {
  const b = new Blob([new Uint8Array(1)], { type: "image/jpeg" });
  Object.defineProperty(b, "size", { value: size });
  return b;
};

describe("limites", () => {
  it("teto de 4 MB (decimais) e compressão a partir de 3 MB", () => {
    expect(MAX_UPLOAD_BYTES).toBe(4_000_000);
    expect(COMPRESS_THRESHOLD_BYTES).toBe(3_000_000);
    expect(COMPRESS_MAX_SIDE_PX).toBe(2400);
    expect(COMPRESS_QUALITY).toBe(0.85);
  });
  it("scaledSize preserva a proporção e não amplia", () => {
    expect(scaledSize(4800, 3200, 2400)).toEqual({ width: 2400, height: 1600 });
    expect(scaledSize(3000, 6000, 2400)).toEqual({ width: 1200, height: 2400 });
    expect(scaledSize(1000, 800, 2400)).toEqual({ width: 1000, height: 800 });
  });
});

describe("prepareUpload", () => {
  it("imagem até 3 MB segue como está, sem chamar o redimensionador", async () => {
    const resize = vi.fn();
    const file = fakeFile("a.jpg", "image/jpeg", COMPRESS_THRESHOLD_BYTES);
    const r = await prepareUpload(file, { resize });
    expect(r).toEqual({ ok: true, file, compressed: false });
    expect(resize).not.toHaveBeenCalled();
  });

  it("imagem acima de 3 MB é comprimida para JPEG (0,85; lado 2400)", async () => {
    const resize = vi.fn(async () => blobOf(900_000));
    const r = await prepareUpload(fakeFile("foto lista.png", "image/png", 8_000_000), { resize });
    expect(resize).toHaveBeenCalledWith(expect.any(File), COMPRESS_MAX_SIDE_PX, COMPRESS_QUALITY);
    expect(r.ok && r.compressed).toBe(true);
    if (r.ok) {
      expect(r.file.type).toBe("image/jpeg");
      expect(r.file.name).toBe("foto lista.jpg");
    }
  });

  it("HEIC (ou imagem que o navegador não decodifica) acima de 3 MB: mensagem clara", async () => {
    const resize = vi.fn(async () => {
      throw new Error("decode");
    });
    const r = await prepareUpload(fakeFile("IMG_1.heic", "", 5_000_000), { resize });
    expect(r).toEqual({ ok: false, message: ERROR_MESSAGES.image_undecodable });
    expect(ERROR_MESSAGES.image_undecodable).toMatch(/JPG|PNG/);
  });

  it("depois de comprimir, ainda acima de 4 MB: recusa", async () => {
    const r = await prepareUpload(fakeFile("a.jpg", "image/jpeg", 9_000_000), { resize: async () => blobOf(MAX_UPLOAD_BYTES + 1) });
    expect(r).toEqual({ ok: false, message: ERROR_MESSAGES.file_too_large });
  });

  it("PDF acima de 4 MB é recusado com mensagem própria; até 4 MB passa", async () => {
    const resize = vi.fn();
    const big = await prepareUpload(fakeFile("l.pdf", "application/pdf", MAX_UPLOAD_BYTES + 1), { resize });
    expect(big).toEqual({ ok: false, message: ERROR_MESSAGES.pdf_too_large });
    expect(ERROR_MESSAGES.pdf_too_large).toContain("4 MB");
    const ok = await prepareUpload(fakeFile("l.pdf", "application/pdf", MAX_UPLOAD_BYTES), { resize });
    expect(ok.ok).toBe(true);
    expect(resize).not.toHaveBeenCalled();
  });

  it("outros tipos acima de 4 MB: file_too_large", async () => {
    const r = await prepareUpload(fakeFile("a.bin", "application/octet-stream", 5_000_000), { resize: vi.fn() });
    expect(r).toEqual({ ok: false, message: ERROR_MESSAGES.file_too_large });
  });
});
