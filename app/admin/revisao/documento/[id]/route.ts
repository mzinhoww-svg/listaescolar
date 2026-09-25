import { NextResponse } from "next/server";

import { getSessionActor } from "@/features/auth/actor";
import { getReviewDocumentRef } from "@/features/review/queries";
import { submissionIdSchema } from "@/features/review/schemas";
import { UPLOAD_BUCKET } from "@/features/submissions/constants";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const SIGNED_URL_SECONDS = 60;
const notFound = () => new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * Documento do envio: só admin recebe 307 para uma URL assinada de 60 s do bucket privado. Sem sessão, outro papel, id
 * inválido, envio inexistente ou erro do Storage respondem o MESMO 404 (nada revela a existência do envio nem o caminho).
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getSessionActor();
  if (!actor || actor.role !== "admin") return notFound();
  const id = submissionIdSchema.safeParse((await ctx.params).id);
  if (!id.success) return notFound();
  try {
    const ref = await getReviewDocumentRef(actor, id.data);
    if (!ref) return notFound();
    const { data, error } = await createAdminClient().storage.from(UPLOAD_BUCKET).createSignedUrl(ref.storagePath, SIGNED_URL_SECONDS);
    if (error || !data?.signedUrl) return notFound();
    return NextResponse.redirect(data.signedUrl, { status: 307, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    return notFound();
  }
}
