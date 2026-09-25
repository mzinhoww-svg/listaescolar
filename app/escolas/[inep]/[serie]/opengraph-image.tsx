import { findGrade } from "@/features/grades/catalog";
import { loadSchool } from "@/features/schools/search/load-school";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/lib/og/render";

export const alt = "Lista de material escolar no ListaCerta";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 3600;

export default async function Image({ params }: { params: Promise<{ inep: string; serie: string }> }) {
  const { inep, serie } = await params;
  const grade = findGrade(serie);
  const school = await loadSchool(inep).catch((error: unknown) => {
    console.error("[og-image]", { code: error instanceof Error ? error.name : "unknown" });
    return null;
  });
  if (!school || !grade) return renderOgImage();
  return renderOgImage({
    headline: school.name,
    detail: `${school.isDemo ? "Demonstração · " : ""}Lista de material · ${grade.label}`,
  });
}
