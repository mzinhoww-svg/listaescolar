"use server";

import { getCurrentUser } from "@/features/auth/queries";
import { notifyInputSchema, type NotifyState } from "@/features/submissions/form-schema";
import { createClient } from "@/lib/supabase/server";

/**
 * Registra o canal de aviso do envio (`jobs.notify_channel/notify_target`). Usa o cliente DO USUÁRIO: a RLS
 * (grant de coluna + política) só deixa o dono do envio alterar. "browser" só registra a preferência;
 * o Web Push real é da S11.
 */
export async function setNotifyAction(_prev: NotifyState, formData: FormData): Promise<NotifyState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Entre na sua conta para continuar." };
  const parsed = notifyInputSchema.safeParse({
    submissionId: formData.get("submissionId"),
    channel: formData.get("channel"),
    target: formData.get("target") ?? undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Confira os dados informados." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .update({ notify_channel: parsed.data.channel, notify_target: parsed.data.target })
    .eq("submission_id", parsed.data.submissionId)
    .select("id");
  if (error || !data || data.length === 0) {
    return { status: "error", message: "Não foi possível registrar o aviso agora." };
  }
  return { status: "saved", channel: parsed.data.channel };
}
