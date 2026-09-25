import Image_ from "./opengraph-image";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og/render";

export const alt = "Perfil da escola no ListaCerta";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 3600;

export default function Image(props: { params: Promise<{ inep: string }> }) {
  return Image_(props);
}
