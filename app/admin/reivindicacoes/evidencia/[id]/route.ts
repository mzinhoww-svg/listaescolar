import { NextResponse } from "next/server";

import { getSessionActor } from "@/features/auth/actor";
import { serviceClaimsRepository } from "@/features/claims/action-support";
import { uuidSchema } from "@/features/claims/schemas";

export const dynamic = "force-dynamic";

const notFound = () => new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });

/** Evidência: admin recebe um redirect para URL assinada de 60 s; qualquer outro (ou erro) recebe 404 sem detalhe. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getSessionActor();
  if (!actor || actor.role !== "admin") return notFound();
  const id = uuidSchema.safeParse((await ctx.params).id);
  if (!id.success) return notFound();
  try {
    const url = await serviceClaimsRepository().evidenceSignedUrl(actor, id.data);
    return NextResponse.redirect(url, { status: 307, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    return notFound();
  }
}
