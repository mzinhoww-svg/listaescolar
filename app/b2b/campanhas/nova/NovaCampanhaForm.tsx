"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createCampaignAction, submitCampaignAction } from "@/features/campaigns/actions";
import { GRADE_STAGES, PRICING_MODELS } from "@/features/campaigns/schemas";
import { GRADE_STAGE_LABEL, PRICING_MODEL_LABEL } from "@/components/b2b/CampaignStatusBadge";

const inputClass = "border-texto-3/30 h-11 w-full rounded-[12px] border bg-white px-3 text-[14px]";
const labelClass = "text-texto-2 text-[13px] font-bold";

export function NovaCampanhaForm({ partnerId }: { partnerId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [productLabel, setProductLabel] = useState("");
  const [creativeText, setCreativeText] = useState("");
  const [pricingModel, setPricingModel] = useState<"cpm" | "cpc">("cpm");
  const [bidReais, setBidReais] = useState("");
  const [totalBudgetReais, setTotalBudgetReais] = useState("");
  const [dailyBudgetReais, setDailyBudgetReais] = useState("");
  const [targetCategory, setTargetCategory] = useState("");
  const [gradeStage, setGradeStage] = useState<"" | "ei" | "ef" | "em">("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendNow, setSendNow] = useState(true);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const created = await createCampaignAction({
      partnerId,
      name,
      productLabel,
      creativeText: creativeText.trim() === "" ? undefined : creativeText,
      pricingModel,
      bidReais: Number(bidReais),
      totalBudgetReais: Number(totalBudgetReais),
      dailyBudgetReais: dailyBudgetReais.trim() === "" ? undefined : Number(dailyBudgetReais),
      targetCategory,
      targetGradeStages: gradeStage === "" ? undefined : [gradeStage],
    });
    if (!created.ok) {
      setPending(false);
      setError(created.message);
      return;
    }
    if (sendNow) {
      const submitted = await submitCampaignAction({ campaignId: created.data.campaignId });
      setPending(false);
      if (!submitted.ok) {
        setError(submitted.message);
        return;
      }
    }
    setPending(false);
    router.push("/b2b/campanhas");
  }

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-4 rounded-[20px] bg-white p-6">
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Nome da campanha</span>
        <input required name="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} maxLength={120} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Produto sugerido</span>
        <input required name="productLabel" value={productLabel} onChange={(e) => setProductLabel(e.target.value)} className={inputClass} maxLength={200} placeholder="Ex.: Caderno universitário 96 folhas" />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Texto do criativo (opcional)</span>
        <input name="creativeText" value={creativeText} onChange={(e) => setCreativeText(e.target.value)} className={inputClass} maxLength={280} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Categoria alvo (mesma da lista, ex.: papelaria, uniforme)</span>
        <input required name="targetCategory" value={targetCategory} onChange={(e) => setTargetCategory(e.target.value)} className={inputClass} maxLength={100} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Série (opcional; vazio = todas)</span>
        <select name="gradeStage" value={gradeStage} onChange={(e) => setGradeStage(e.target.value as typeof gradeStage)} className={inputClass}>
          <option value="">Todas as séries</option>
          {GRADE_STAGES.map((s) => (
            <option key={s} value={s}>
              {GRADE_STAGE_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Modelo de cobrança</span>
        <select name="pricingModel" value={pricingModel} onChange={(e) => setPricingModel(e.target.value as "cpm" | "cpc")} className={inputClass}>
          {PRICING_MODELS.map((m) => (
            <option key={m} value={m}>
              {PRICING_MODEL_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Bid (R$ {pricingModel === "cpm" ? "por mil exibições" : "por clique"})</span>
          <input required name="bidReais" type="number" min={0.01} step={0.01} value={bidReais} onChange={(e) => setBidReais(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Orçamento total (R$)</span>
          <input required name="totalBudgetReais" type="number" min={0.01} step={0.01} value={totalBudgetReais} onChange={(e) => setTotalBudgetReais(e.target.value)} className={inputClass} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Orçamento diário (R$, opcional)</span>
        <input name="dailyBudgetReais" type="number" min={0.01} step={0.01} value={dailyBudgetReais} onChange={(e) => setDailyBudgetReais(e.target.value)} className={inputClass} />
      </label>
      <p className="bg-campo text-texto-2 rounded-campo px-4 py-3 text-[13px] font-bold">
        Toda campanha aparece marcada como <strong>&ldquo;Patrocinado&rdquo;</strong>. O orçamento acima é só o limite que você definiu — é acúmulo informativo, nunca uma cobrança automática.
      </p>
      <label className="flex items-center gap-2 text-[13px] font-bold">
        <input type="checkbox" checked={sendNow} onChange={(e) => setSendNow(e.target.checked)} />
        Enviar para aprovação do admin agora
      </label>
      {error ? <p className="text-[13px] font-bold text-erro-texto">{error}</p> : null}
      <button type="submit" disabled={pending} className="bg-tinta text-papel rounded-botao h-12 text-[15px] font-extrabold disabled:opacity-50">
        {pending ? "Salvando…" : sendNow ? "Criar e enviar para aprovação" : "Salvar rascunho"}
      </button>
    </form>
  );
}
