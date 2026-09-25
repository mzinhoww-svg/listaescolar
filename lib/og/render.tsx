import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";
export const OG_TAGLINE = "A lista oficial da escola, pronta para comprar.";

/** Tudo vem do repositório (fonte OFL e logo de docs/brand): nada é baixado em build nem em execução. */
async function loadAssets() {
  const [font, logo] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/PlusJakartaSans-ExtraBold.ttf")),
    readFile(join(process.cwd(), "public/brand/logo-horizontal-negativo.svg")),
  ]);
  return { font, logoUri: `data:image/svg+xml;base64,${logo.toString("base64")}` };
}

type Props = { headline?: string; detail?: string };

/** Imagem 1200×630: fundo Tinta, logo negativo, frase e (opcional) escola/série. Sem número nem imagem remota. */
export async function renderOgImage({ headline = OG_TAGLINE, detail }: Props = {}) {
  const { font, logoUri } = await loadAssets();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0F1B2D",
          color: "#F5F2EA",
          padding: "64px 72px",
          fontFamily: "Plus Jakarta Sans",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- next/og não usa next/image */}
        <img src={logoUri} width={434} height={98} alt="" />
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.035em", display: "flex" }}>
            {headline}
          </div>
          {detail ? <div style={{ fontSize: 32, color: "#2FCB86", fontWeight: 800, display: "flex" }}>{detail}</div> : null}
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: [{ name: "Plus Jakarta Sans", data: font, weight: 800, style: "normal" }] },
  );
}
