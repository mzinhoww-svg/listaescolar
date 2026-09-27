import { z } from "zod";

import { widgetSchoolLists } from "@/features/widget/public";
import { widgetJson, widgetOptionsResponse, widgetRateLimited } from "@/features/widget/route-helpers";

export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ inep: z.string().regex(/^[0-9]{8}$/) });
const QuerySchema = z.object({ partnerId: z.uuid(), year: z.coerce.number().int().min(2020).max(2100).optional() });

export async function GET(request: Request, ctx: { params: Promise<{ inep: string }> }): Promise<Response> {
  const { inep } = await ctx.params;
  const paramsParsed = ParamsSchema.safeParse({ inep });
  const { searchParams } = new URL(request.url);
  const queryParsed = QuerySchema.safeParse({ partnerId: searchParams.get("partnerId"), year: searchParams.get("year") ?? undefined });
  if (!paramsParsed.success || !queryParsed.success) return widgetJson({ error: "invalid_request" }, 400);
  if (widgetRateLimited(request, queryParsed.data.partnerId)) return widgetJson({ error: "rate_limited" }, 429);
  const lists = await widgetSchoolLists(queryParsed.data.partnerId, paramsParsed.data.inep, queryParsed.data.year);
  if (lists === null) return widgetJson({ error: "not_found" }, 404);
  return widgetJson({ data: lists });
}

export const OPTIONS = widgetOptionsResponse;
