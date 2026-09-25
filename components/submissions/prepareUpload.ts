import { MAX_UPLOAD_BYTES } from "@/features/submissions/constants";
import { ERROR_MESSAGES } from "@/features/submissions/copy";

/** A Vercel limita o corpo da requisição a 4,5 MB: o teto é 4 MB e fotos maiores são reduzidas no navegador. */
export const COMPRESS_THRESHOLD_BYTES = 3_000_000;
export const COMPRESS_MAX_SIDE_PX = 2400;
export const COMPRESS_QUALITY = 0.85;

export type Resize = (file: File, maxSidePx: number, quality: number) => Promise<Blob>;
export type PrepareResult = { ok: true; file: File; compressed: boolean } | { ok: false; message: string };

export function scaledSize(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
const isImage = (f: File) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name);

type Bitmap = { width: number; height: number };
type CreateBitmap = (file: Blob, options?: { imageOrientation: "from-image" }) => Promise<ImageBitmap>;
type DrawCtx = {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(image: never, x: number, y: number, w: number, h: number): void;
};

/** Decodifica respeitando a orientação EXIF; navegadores que não aceitam a opção caem no padrão. */
export async function decodeBitmap(file: Blob, create: CreateBitmap = (f, o) => createImageBitmap(f, o)): Promise<ImageBitmap> {
  try {
    return await create(file, { imageOrientation: "from-image" });
  } catch {
    return create(file);
  }
}

/** JPEG não tem transparência: pinta o fundo de branco antes da imagem (PNG transparente não vira preto). */
export function drawOnWhite(ctx: DrawCtx, bitmap: Bitmap, width: number, height: number): void {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap as never, 0, 0, width, height);
}

/** Redução por canvas (JPEG). Lança se o navegador não decodifica a imagem (ex.: HEIC fora do Safari). */
export const canvasResize: Resize = async (file, maxSidePx, quality) => {
  const bitmap = await decodeBitmap(file);
  try {
    const { width, height } = scaledSize(bitmap.width, bitmap.height, maxSidePx);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    drawOnWhite(ctx, bitmap, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", quality),
    );
  } finally {
    bitmap.close();
  }
};

/** Decide o que enviar: PDF > 4 MB recusado; imagem > 3 MB reduzida; o servidor repete a checagem de tamanho. */
export async function prepareUpload(file: File, deps: { resize: Resize } = { resize: canvasResize }): Promise<PrepareResult> {
  if (isPdf(file)) {
    return file.size > MAX_UPLOAD_BYTES ? { ok: false, message: ERROR_MESSAGES.pdf_too_large } : { ok: true, file, compressed: false };
  }
  if (isImage(file) && file.size > COMPRESS_THRESHOLD_BYTES) {
    let blob: Blob;
    try {
      blob = await deps.resize(file, COMPRESS_MAX_SIDE_PX, COMPRESS_QUALITY);
    } catch {
      return { ok: false, message: ERROR_MESSAGES.image_undecodable };
    }
    if (blob.size > MAX_UPLOAD_BYTES) return { ok: false, message: ERROR_MESSAGES.file_too_large };
    const name = `${file.name.replace(/\.[^./\\]+$/, "") || "lista"}.jpg`;
    return { ok: true, file: new File([blob], name, { type: "image/jpeg" }), compressed: true };
  }
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, message: ERROR_MESSAGES.file_too_large };
  return { ok: true, file, compressed: false };
}
