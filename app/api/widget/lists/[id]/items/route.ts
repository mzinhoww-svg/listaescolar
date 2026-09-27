import { z } from "zod";

import { widgetListItems } from "@/features/widget/public";
import { widgetJson, widgetOptionsResponse, widgetRateLimited } from "@/features/widget/route-helpers";

export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ id: z.uuid() });
const QuerySchema = z.object({ partnerId: z.uuid() });

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const paramsParsed = ParamsSchema.safeParse({ id });
  const { searchParams } = new URL(request.url);
  const queryParsed = QuerySchema.safeParse({ partnerId: searchParams.get("partnerId") });
  if (!paramsParsed.success || !queryParsed.success) return widgetJson({ error: "invalid_request" }, 400);
  if (widgetRateLimited(request, queryParsed.data.partnerId)) return widgetJson({ error: "rate_limited" }, 429);
  const items = await widgetListItems(queryParsed.data.partnerId, paramsParsed.data.id);
  if (items === null) return widgetJson({ error: "not_found" }, 404);
  return widgetJson({ data: items });
}

export const OPTIONS = widgetOptionsResponse;
