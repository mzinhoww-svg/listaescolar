import Image_ from "./opengraph-image";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og/render";

export const alt = "Lista de material escolar no ListaCerta";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 3600;

export default function Image(props: { params: Promise<{ inep: string; serie: string }> }) {
  return Image_(props);
}
