import { z } from "zod";

import { getWidgetPublicConfig } from "@/features/widget/public";
import { widgetJson, widgetOptionsResponse, widgetRateLimited } from "@/features/widget/route-helpers";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({ partnerId: z.uuid() });

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({ partnerId: searchParams.get("partnerId") });
  if (!parsed.success) return widgetJson({ error: "invalid_request" }, 400);
  if (widgetRateLimited(request, parsed.data.partnerId)) return widgetJson({ error: "rate_limited" }, 429);
  const config = await getWidgetPublicConfig(parsed.data.partnerId);
  if (!config) return widgetJson({ error: "not_found" }, 404);
  return widgetJson({ data: { partnerId: config.partnerId, tradeName: config.tradeName, accentColor: config.accentColor, cartTargetDomain: config.cartTargetDomain } });
}

export const OPTIONS = widgetOptionsResponse;
