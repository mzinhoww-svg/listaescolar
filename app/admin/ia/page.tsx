import type { Metadata } from "next";

import { AdminShell } from "@/components/admin/AdminShell";
import { Notice } from "@/components/stationeries/PanelShell";
import { updateAiSettingsAction } from "@/features/ai-settings/actions";
import { CRITICAL_ALERT_CODES, CRITICAL_ALERT_LABEL } from "@/features/ai-settings/ports";
import { getAiSettingsForAdmin } from "@/features/ai-settings/queries";
import type { AiSettingsView } from "@/features/ai-settings/ports";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Configuração de IA · Admin · ListaCerta", robots: { index: false, follow: false } };

const ERROR_MESSAGE: Record<string, string> = {
  invalido: "Dados inválidos. Revise os limiares e o número de escalonamentos.",
  forbidden: "Você não tem acesso a esta ação.",
  falha: "Não foi possível salvar agora.",
};

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const { user } = await requireAccess("/admin/ia");
  const sp = await searchParams;
  const actor = await getSessionActor();
  let settings: AiSettingsView | null = null;
  let failed = false;
  try {
    if (actor) settings = await getAiSettingsForAdmin(actor);
  } catch (error) {
    console.error("ai_settings (admin)", error instanceof Error ? error.message : "erro");
    failed = true;
  }
  return (
    <AdminShell active="/admin/ia" email={user.email} breadcrumb="Admin / Configuração de IA" title="Configuração de IA">
      {sp.ok ? <Notice kind="ok">Configuração salva.</Notice> : null}
      {sp.erro ? <Notice kind="error">{ERROR_MESSAGE[sp.erro] ?? "Não foi possível concluir agora."}</Notice> : null}
      {failed || !settings ? (
        <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">Não foi possível carregar.</p>
      ) : (
        <form action={updateAiSettingsAction} className="grid max-w-2xl gap-4 rounded-[20px] bg-white p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-[13px] font-bold">
              Limiar de confiança geral (0 a 1)
              <input name="confidenceThreshold" type="number" step="0.01" min={0} max={1} defaultValue={settings.confidenceThreshold} required className="bg-campo rounded-campo h-11 px-3 text-[14px] font-medium" />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-bold">
              Limiar de confiança por item (0 a 1)
              <input name="itemConfidenceThreshold" type="number" step="0.01" min={0} max={1} defaultValue={settings.itemConfidenceThreshold} required className="bg-campo rounded-campo h-11 px-3 text-[14px] font-medium" />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-bold">
              Máximo de escalonamentos (0 a 3)
              <input name="maxEscalations" type="number" step="1" min={0} max={3} defaultValue={settings.maxEscalations} required className="bg-campo rounded-campo h-11 px-3 text-[14px] font-medium" />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-bold">
              Versão do pipeline
              <input name="pipelineVersion" defaultValue={settings.pipelineVersion} required maxLength={40} className="bg-campo rounded-campo h-11 px-3 text-[14px] font-medium" />
            </label>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[13px] font-bold">Alertas críticos (bloqueiam publicação automática)</legend>
            {CRITICAL_ALERT_CODES.map((code) => (
              <label key={code} className="flex items-center gap-2 text-[13px] font-semibold">
                <input type="checkbox" name="criticalAlerts" value={code} defaultChecked={settings.criticalAlerts.includes(code)} />
                {CRITICAL_ALERT_LABEL[code]}
              </label>
            ))}
          </fieldset>
          <div className="bg-papel rounded-campo p-4 text-[13px]">
            <p className="font-bold">Publicação automática: {settings.autoPublishEnabled ? "ligada" : "desligada"} (só leitura)</p>
            <p className="text-texto-2 mt-1">
              Ligar sozinha exige um Ruling explícito (registro no ledger); não é editável nesta tela. Roteamento de
              modelo (rotas por provedor) também é só leitura aqui — edição fica para uma fatia futura.
            </p>
          </div>
          <button type="submit" className="bg-tinta text-papel rounded-botao h-12 w-fit px-6 text-[14px] font-extrabold">Salvar</button>
        </form>
      )}
    </AdminShell>
  );
}
