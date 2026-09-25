import { createHash } from "node:crypto";

export const MAX_EVIDENCE_BYTES = 4_000_000;
export const EVIDENCE_MIMES = ["application/pdf", "image/jpeg", "image/png"] as const;
export type EvidenceMime = (typeof EVIDENCE_MIMES)[number];
const EXT: Record<EvidenceMime, "pdf" | "jpg" | "png"> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

export type EvidenceSniff =
  | { ok: true; mime: EvidenceMime; ext: "pdf" | "jpg" | "png"; size: number; sha256: string }
  | { ok: false; reason: "empty" | "too_large" | "unsupported_type" | "mime_mismatch" };

function detect(b: Uint8Array): EvidenceMime | null {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (b.length >= 5 && at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf"; // %PDF-
  if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  return null;
}

/** Confere tamanho e assinatura de bytes contra o MIME declarado. O tipo vale pelos bytes, nunca pelo nome. */
export function sniffEvidence(bytes: Uint8Array, declaredMime: string): EvidenceSniff {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > MAX_EVIDENCE_BYTES) return { ok: false, reason: "too_large" };
  const found = detect(bytes);
  if (!found) return { ok: false, reason: "unsupported_type" };
  if (declaredMime !== "" && found !== declaredMime) return { ok: false, reason: "mime_mismatch" };
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { ok: true, mime: found, ext: EXT[found], size: bytes.length, sha256 };
}

/** Nome exibido/guardado: sem pasta, sem controle, sem acento, só `[A-Za-z0-9._-]`, até 120 caracteres. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^[._-]+/, "")
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : "documento";
}
