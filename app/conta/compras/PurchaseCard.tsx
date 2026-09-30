import { SubmitButton } from "@/components/cart/SubmitButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { REVIEW_TAG_LABEL, REVIEW_TAGS, type PurchaseAnswer, type SurveyLeadView } from "@/features/conversion/ports";
import { MIN_HOURS_BEFORE_SURVEY, surveyAskable } from "@/features/conversion/survey";

const ANSWER_LABEL: Record<PurchaseAnswer, string> = {
  bought_here: "Você disse: comprei aqui",
  not_yet: "Você disse: ainda não comprei",
  bought_elsewhere: "Você disse: comprei em outro lugar",
};

type Action = (formData: FormData) => Promise<void>;

/**
 * As três respostas. "Comprei aqui" tem efeito (registra a venda, que pode gerar cobrança à papelaria), então passa por
 * `ConfirmDialog` com o efeito escrito; as outras duas não têm consequência e enviam direto.
 */
function AnswerButtons({ leadId, confirmPurchase }: { leadId: string; confirmPurchase: Action }) {
  return (
    <div className="flex flex-col gap-2">
      <ConfirmDialog
        triggerLabel="Comprei aqui"
        triggerStyle="button"
        triggerVariant="primary"
        confirmVariant="primary"
        title="Confirmar que você comprou nesta papelaria?"
        body={
          <>
            <p>
              Ao confirmar, registramos a venda e a papelaria pode ser cobrada por ela. Só confirme se a compra aconteceu. Se ainda não
              comprou, escolha “Ainda não”.
            </p>
            <p className="mt-2">Se errar, você corrige a resposta nesta tela.</p>
          </>
        }
        confirmLabel="Confirmar: comprei aqui"
        action={confirmPurchase}
        hidden={{ leadId, answer: "bought_here" }}
      />
      {(["not_yet", "bought_elsewhere"] as const).map((answer) => (
        <form key={answer} action={confirmPurchase} className="flex">
          <input type="hidden" name="leadId" value={leadId} />
          <input type="hidden" name="answer" value={answer} />
          <SubmitButton variant="outline" pendingLabel="Salvando" className="w-full">
            {answer === "not_yet" ? "Ainda não" : "Comprei em outro lugar"}
          </SubmitButton>
        </form>
      ))}
    </div>
  );
}

function ReviewForm({ leadId, createReview }: { leadId: string; createReview: Action }) {
  return (
    <form action={createReview} className="flex flex-col gap-2 border-t border-black/10 pt-3">
      <input type="hidden" name="leadId" value={leadId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[14px] font-bold">Como foi o atendimento? Escolha uma nota de 1 a 5.</legend>
        <div className="flex gap-2" role="radiogroup" aria-label="Nota">
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              className="has-focus-visible:outline-verde-fundo flex size-11 cursor-pointer items-center justify-center rounded-full border border-black/15 text-[14px] font-extrabold has-checked:bg-tinta has-checked:text-papel has-focus-visible:outline-2 has-focus-visible:outline-offset-2"
            >
              {/* Sem nota pré-marcada: ela entra na média pública da papelaria, então precisa ser escolha da pessoa (UX-027). */}
              <input type="radio" name="rating" value={n} required className="sr-only" />
              {n}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        {REVIEW_TAGS.map((tag) => (
          <label key={tag} className="bg-campo has-checked:bg-tinta has-checked:text-papel rounded-botao px-3 py-2.5 text-[12px] font-bold">
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
      <SubmitButton pendingLabel="Enviando a avaliação" className="self-start">
        Enviar avaliação
      </SubmitButton>
    </form>
  );
}

/** Um pedido: pesquisa "Você comprou?" (App22) e, quando elegível, avaliação (App23). */
export function PurchaseCard({
  item,
  confirmPurchase,
  createReview,
  now = new Date(),
}: {
  item: SurveyLeadView;
  confirmPurchase: Action;
  createReview: Action;
  now?: Date;
}) {
  const askable = surveyAskable(item, now);
  return (
    // Uma ação principal por pedido: cada cartão é a sua própria região.
    <article data-region={`pedido-${item.code}`} className="rounded-card flex flex-col gap-3 bg-white p-5">
      <div>
        <p className="text-[15px] font-extrabold">{item.stationeryName}</p>
        <p className="text-texto-3 text-[13px] font-bold">{item.schoolName} · pedido {item.code}</p>
      </div>
      {item.existingAnswer !== null ? (
        <>
          <p className="text-texto-2 text-[13px] font-semibold">{ANSWER_LABEL[item.existingAnswer]}</p>
          <details className="flex flex-col gap-2">
            <summary className="text-verde-fundo flex min-h-11 cursor-pointer items-center text-[14px] font-extrabold underline underline-offset-4">
              Corrigir resposta
            </summary>
            <div className="pt-2">
              <AnswerButtons leadId={item.leadId} confirmPurchase={confirmPurchase} />
            </div>
          </details>
        </>
      ) : askable ? (
        <div className="flex flex-col gap-2">
          <p className="text-[14px] font-bold">Você comprou nesta papelaria?</p>
          <AnswerButtons leadId={item.leadId} confirmPurchase={confirmPurchase} />
        </div>
      ) : (
        <p className="bg-campo text-texto-2 rounded-campo px-3 py-2.5 text-[13px] font-semibold">
          Você poderá informar a compra quando a papelaria responder ou {MIN_HOURS_BEFORE_SURVEY} horas depois do pedido.
        </p>
      )}
      {item.alreadyReviewed ? (
        <p className="text-verde-fundo text-[13px] font-bold">Avaliação enviada. Obrigado!</p>
      ) : item.canReview ? (
        <ReviewForm leadId={item.leadId} createReview={createReview} />
      ) : null}
    </article>
  );
}
