import { detectMime } from "../../supabase/functions/_shared/worker-core";
import {
  ALLOWED_MIME_TYPES,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_SIDE_PX,
  MAX_UPLOAD_BYTES,
  type AllowedMime,
} from "./constants";

export type UploadErrorCode =
  | "empty_file"
  | "file_too_large"
  | "unsupported_type"
  | "signature_mismatch"
  | "encrypted_pdf"
  | "corrupt_file"
  | "image_too_large";

export type UploadLimits = { maxBytes: number; maxSidePx: number; maxPixels: number };
export const DEFAULT_LIMITS: UploadLimits = {
  maxBytes: MAX_UPLOAD_BYTES,
  maxSidePx: MAX_IMAGE_SIDE_PX,
  maxPixels: MAX_IMAGE_PIXELS,
};

export type UploadFile = { name: string; declaredMime: string; size: number; bytes: Uint8Array };
export type UploadCheck = { ok: true; mime: AllowedMime } | { ok: false; code: UploadErrorCode };

const fail = (code: UploadErrorCode): UploadCheck => ({ ok: false, code });

/** Barato: use com `File.size` ANTES de ler o conteúdo em memória. */
export function checkUploadSize(size: number, limits: UploadLimits = DEFAULT_LIMITS): UploadCheck | null {
  if (!Number.isFinite(size) || size <= 0) return fail("empty_file");
  if (size > limits.maxBytes) return fail("file_too_large");
  return null;
}

const MIME_ALIASES: Record<string, AllowedMime> = { "image/jpg": "image/jpeg", "image/heif": "image/heic" };

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

export { detectMime };

function pngSize(b: Uint8Array): { w: number; h: number } | null {
  if (b.length < 24 || ascii(b, 12, 16) !== "IHDR") return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { w: dv.getUint32(16), h: dv.getUint32(20) };
}

function jpegSize(b: Uint8Array): { w: number; h: number } | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof) return { w: dv.getUint16(i + 7), h: dv.getUint16(i + 5) };
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    i += 2 + dv.getUint16(i + 2);
  }
  return null;
}

function checkPdf(b: Uint8Array): UploadErrorCode | null {
  const text = new TextDecoder("latin1").decode(b);
  if (text.includes("/Encrypt")) return "encrypted_pdf";
  if (!text.slice(-1024).includes("%%EOF")) return "corrupt_file";
  return null;
}

function checkImage(mime: AllowedMime, b: Uint8Array, limits: UploadLimits): UploadErrorCode | null {
  const dims = mime === "image/png" ? pngSize(b) : mime === "image/jpeg" ? jpegSize(b) : undefined;
  if (dims === undefined) return null; // webp/heic: sem leitura de dimensões; o pipeline recusa o que não abrir
  if (!dims || dims.w === 0 || dims.h === 0) return "corrupt_file";
  if (dims.w > limits.maxSidePx || dims.h > limits.maxSidePx || dims.w * dims.h > limits.maxPixels) {
    return "image_too_large";
  }
  return null;
}

export function validateUpload(file: UploadFile, limits: UploadLimits = DEFAULT_LIMITS): UploadCheck {
  const sizeIssue = checkUploadSize(file.size, limits);
  if (sizeIssue) return sizeIssue;
  if (file.bytes.length === 0) return fail("empty_file");
  if (file.bytes.length > limits.maxBytes) return fail("file_too_large");
  const declared = file.declaredMime.trim().toLowerCase();
  const normalized = MIME_ALIASES[declared] ?? declared;
  if (normalized !== "" && !(ALLOWED_MIME_TYPES as readonly string[]).includes(normalized)) {
    return fail("unsupported_type");
  }
  const detected = detectMime(file.bytes);
  if (!detected) return fail("unsupported_type");
  if (normalized !== "" && normalized !== detected) return fail("signature_mismatch");
  const issue = detected === "application/pdf" ? checkPdf(file.bytes) : checkImage(detected, file.bytes, limits);
  return issue ? fail(issue) : { ok: true, mime: detected };
}

const EXT: Record<AllowedMime, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};
const OK_EXT: Record<AllowedMime, readonly string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/heic": ["heic", "heif"],
};

/**
 * Sem diretórios, `..`, caracteres de controle ou separadores; sempre um nome utilizável (<= 120). A extensão é
 * FORÇADA pelo tipo detectado no conteúdo (`mime`): "lista.exe" com PDF dentro vira "lista.pdf".
 */
export function sanitizeFileName(name: string, mime: AllowedMime): string {
  const last = name.split(/[\\/]/).pop() ?? "";
  let clean = last.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").replace(/\.{2,}/g, ".");
  clean = clean.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9 ._()-]/g, "_").replace(/^[.\s]+/, "").trim();
  const ext = /\.([A-Za-z0-9]{1,5})$/.exec(clean);
  if (ext && !OK_EXT[mime].includes(ext[1]!.toLowerCase())) clean = clean.slice(0, ext.index);
  const hasOkExt = OK_EXT[mime].some((e) => clean.toLowerCase().endsWith(`.${e}`));
  const stem = hasOkExt ? "" : `.${EXT[mime]}`;
  if (clean.length + stem.length > 120) clean = clean.slice(-(120 - stem.length));
  if (clean === "" || clean === "." ) clean = "arquivo";
  return `${clean}${stem}`;
}
