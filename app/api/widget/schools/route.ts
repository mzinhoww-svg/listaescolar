import { z } from "zod";

import { searchWidgetSchools } from "@/features/widget/public";
import { widgetJson, widgetOptionsResponse, widgetRateLimited } from "@/features/widget/route-helpers";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({ partnerId: z.uuid(), q: z.string().min(2).max(80) });

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({ partnerId: searchParams.get("partnerId"), q: searchParams.get("q") });
  if (!parsed.success) return widgetJson({ error: "invalid_request" }, 400);
  if (widgetRateLimited(request, parsed.data.partnerId)) return widgetJson({ error: "rate_limited" }, 429);
  const schools = await searchWidgetSchools(parsed.data.partnerId, parsed.data.q);
  if (schools === null) return widgetJson({ error: "not_found" }, 404);
  return widgetJson({ data: schools });
}

export const OPTIONS = widgetOptionsResponse;
