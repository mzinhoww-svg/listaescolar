import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/lib/og/render";

export const alt = "Pesquisa: a lista de material escolar | ListaCerta";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({ headline: "Como foi comprar a lista de material escolar este ano?" });
}
