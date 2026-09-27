import { hideReviewAction } from "@/features/conversion/actions";
import { REVIEW_HIDE_REASONS, REVIEW_HIDE_REASON_LABEL, REVIEW_TAG_LABEL, type ReviewView } from "@/features/conversion/ports";

const btnOutline = "border-tinta text-tinta rounded-botao h-9 border-[1.5px] px-3 text-[12px] font-extrabold";

/** Moderação de avaliações (App23) para o admin: motivo de OCULTAR sempre de uma lista fechada (revisão de segurança). */
export function ReviewModeration({ reviews }: { reviews: ReviewView[] }) {
  if (reviews.length === 0) {
    return <p className="text-texto-2 text-[14px] font-semibold">Nenhuma avaliação ainda.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {reviews.map((r) => (
        <li key={r.id} className="rounded-card flex flex-wrap items-start justify-between gap-3 bg-white p-4">
          <div className="min-w-0">
            <p className="text-[14px] font-extrabold">
              [{r.rating}/5]{r.isDemo ? " · Demonstração" : ""}{r.status === "hidden" ? ` · oculta (${r.hiddenReason ? REVIEW_HIDE_REASON_LABEL[r.hiddenReason] : "—"})` : ""}
            </p>
            {r.tags.length > 0 ? <p className="text-texto-3 text-[12px] font-semibold">{r.tags.map((t) => REVIEW_TAG_LABEL[t as keyof typeof REVIEW_TAG_LABEL] ?? t).join(", ")}</p> : null}
            {r.comment ? <p className="text-texto-2 mt-1 text-[13px] font-semibold">{r.comment}</p> : null}
          </div>
          {r.status === "published" ? (
            <form action={hideReviewAction} className="flex shrink-0 items-center gap-2">
              <input type="hidden" name="reviewId" value={r.id} />
              <select name="reason" required defaultValue="" aria-label="Motivo para ocultar" className="bg-campo rounded-campo h-9 px-2 text-[12px] font-semibold">
                <option value="" disabled>Motivo</option>
                {REVIEW_HIDE_REASONS.map((reason) => (
                  <option key={reason} value={reason}>{REVIEW_HIDE_REASON_LABEL[reason]}</option>
                ))}
              </select>
              <button type="submit" className={btnOutline}>Ocultar</button>
            </form>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
