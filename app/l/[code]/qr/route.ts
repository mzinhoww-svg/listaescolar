import { z } from "zod";

import { encodeShortCode, parseShortCode, shortLinkUrl } from "@/features/short-links/code";
import { invalidLinkResponse } from "@/features/short-links/resolve";
import { qrMatrix, renderQrSvg } from "@/features/short-links/qr";
import { getSiteOrigin } from "@/lib/site-url";

export const dynamic = "force-dynamic";

const downloadSchema = z.literal("1");

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const { code: raw } = await params;
  const parsed = parseShortCode(raw);
  if (parsed === null) return invalidLinkResponse();
  // Canônico: sem Host/Origin da requisição (forjáveis). Sem origem configurada, 503.
  let origin: string;
  try {
    origin = getSiteOrigin();
  } catch {
    return new Response("Origem do site não configurada.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  // O código exibido é o canônico (normalizado), não a string recebida.
  const code = encodeShortCode(parsed);
  const svg = renderQrSvg(qrMatrix(shortLinkUrl(code, origin)), { size: 512, color: "#0F1B2D" });
  const headers: Record<string, string> = {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
    "X-Robots-Tag": "noindex",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  };
  if (downloadSchema.safeParse(new URL(request.url).searchParams.get("download")).success) {
    headers["Content-Disposition"] = `attachment; filename="listacerta-${code}.svg"`;
  }
  return new Response(svg, { status: 200, headers });
}
