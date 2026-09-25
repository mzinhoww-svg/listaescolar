import { loadSchool } from "@/features/schools/search/load-school";
import { resolveShortLink } from "@/features/short-links/resolve";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const { code } = await params;
  return resolveShortLink(code, { loadSchool });
}
