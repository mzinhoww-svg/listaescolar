import { REVIEW_TAG_LABEL, REVIEW_TAGS, type SurveyLeadView } from "@/features/conversion/ports";

const ANSWER_LABEL: Record<NonNullable<SurveyLeadView["existingAnswer"]>, string> = {
  bought_here: "Você disse: comprei aqui",
  not_yet: "Você disse: ainda não comprei",
  bought_elsewhere: "Você disse: comprei em outro lugar",
};

const btn = "bg-tinta text-papel rounded-botao h-11 px-4 text-[13px] font-extrabold";
const btnOutline = "border-tinta text-tinta rounded-botao h-11 border-[1.5px] px-4 text-[13px] font-extrabold";

/** Um pedido: pesquisa "Você comprou?" (App22) e, quando elegível, avaliação (App23). */
export function PurchaseCard({
  item,
  confirmPurchase,
  createReview,
}: {
  item: SurveyLeadView;
  confirmPurchase: (formData: FormData) => Promise<void>;
  createReview: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="rounded-card flex flex-col gap-3 bg-white p-5">
      <div>
        <p className="text-[15px] font-extrabold">{item.stationeryName}</p>
        <p className="text-texto-3 text-[13px] font-bold">{item.schoolName} · pedido {item.code}</p>
      </div>
      {item.existingAnswer === null ? (
        <div className="flex flex-col gap-2">
          <p className="text-[14px] font-bold">Você comprou nesta papelaria?</p>
          <div className="flex flex-wrap gap-2">
            {(["bought_here", "not_yet", "bought_elsewhere"] as const).map((answer) => (
              <form key={answer} action={confirmPurchase}>
                <input type="hidden" name="leadId" value={item.leadId} />
                <input type="hidden" name="answer" value={answer} />
                <button type="submit" className={answer === "bought_here" ? btn : btnOutline}>
                  {answer === "bought_here" ? "Comprei aqui" : answer === "not_yet" ? "Ainda não" : "Comprei em outro lugar"}
                </button>
              </form>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-texto-2 text-[13px] font-semibold">{ANSWER_LABEL[item.existingAnswer]}</p>
      )}
      {item.alreadyReviewed ? (
        <p className="text-verde-fundo text-[13px] font-bold">Avaliação enviada. Obrigado!</p>
      ) : item.canReview ? (
        <form action={createReview} className="flex flex-col gap-2 border-t border-black/10 pt-3">
          <input type="hidden" name="leadId" value={item.leadId} />
          <p className="text-[14px] font-bold">Como foi o atendimento?</p>
          <div className="flex gap-1" role="radiogroup" aria-label="Nota">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="flex size-9 cursor-pointer items-center justify-center rounded-full border border-black/15 text-[13px] font-extrabold has-checked:bg-tinta has-checked:text-papel">
                <input type="radio" name="rating" value={n} defaultChecked={n === 5} className="sr-only" />
                {n}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {REVIEW_TAGS.map((tag) => (
              <label key={tag} className="bg-campo has-checked:bg-tinta has-checked:text-papel rounded-botao px-3 py-1.5 text-[12px] font-bold">
                <input type="checkbox" name="tags" value={tag} className="sr-only" />
                {REVIEW_TAG_LABEL[tag]}
              </label>
            ))}
          </div>
          <textarea
            name="comment"
            maxLength={500}
            placeholder="Comentário (opcional, sem telefone nem e-mail)"
            aria-label="Comentário (opcional)"
            className="bg-campo rounded-campo min-h-20 px-4 py-3 text-[14px] font-semibold"
          />
          <p className="text-texto-3 text-[12px] font-semibold">Não escreva nomes de crianças nem contatos (telefone, e-mail) no comentário.</p>
          <button type="submit" className={`${btn} self-start`}>Enviar avaliação</button>
        </form>
      ) : null}
    </div>
  );
}
