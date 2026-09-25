import { OG_CONTENT_TYPE, OG_SIZE, OG_TAGLINE, renderOgImage } from "@/lib/og/render";

export const alt = OG_TAGLINE;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage();
}
