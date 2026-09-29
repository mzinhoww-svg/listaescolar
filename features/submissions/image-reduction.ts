import { MAX_UPLOAD_BYTES } from "./constants";

export const TARGET_BYTES = Math.floor(MAX_UPLOAD_BYTES * 0.9);
/** Passos de reserva: a primeira tentativa (lado 2400, qualidade 0,85) é a de `prepareUpload`. */
export const SIDE_STEPS = [2000, 1600] as const;
export const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55] as const;

export type Encoder = (maxSide: number, quality: number) => Promise<Blob>;
export type Reduction = { ok: true; blob: Blob; maxSide: number; quality: number } | { ok: false };

/** Tenta lados e qualidades decrescentes até caber em `target`. Encode que falha ou devolve vazio é pulado. */
export async function reduceToLimit(encode: Encoder, target: number = TARGET_BYTES): Promise<Reduction> {
  for (const maxSide of SIDE_STEPS) {
    for (const quality of QUALITY_STEPS) {
      let blob: Blob | null = null;
      try {
        blob = await encode(maxSide, quality);
      } catch {
        blob = null;
      }
      if (blob && blob.size > 0 && blob.size <= target) return { ok: true, blob, maxSide, quality };
    }
  }
  return { ok: false };
}
