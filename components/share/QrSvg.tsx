import { qrMatrix, qrPathData, qrSide } from "@/features/short-links/qr";

/** QR desenhado como elementos React (nada de HTML vindo de biblioteca). Tinta sobre branco para leitura. */
export function QrSvg({ text, size = 176 }: { text: string; size?: number }) {
  const matrix = qrMatrix(text);
  const n = qrSide(matrix);
  return (
    <svg
      role="img"
      aria-label={`QR code do link ${text}`}
      viewBox={`0 0 ${n} ${n}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="rounded-xl border border-tinta/10"
    >
      <rect width={n} height={n} fill="#FFFFFF" />
      <path fill="#0F1B2D" d={qrPathData(matrix)} />
    </svg>
  );
}
