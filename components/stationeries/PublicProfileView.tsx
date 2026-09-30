import { formatBRL } from "@/features/cart/money";
import { REVIEW_TAG_LABEL, type ReviewTag, type ReviewView } from "@/features/conversion/ports";
import type { PublicProfile } from "@/features/stationeries/repository";
import { PAYMENT_METHODS } from "@/features/stationeries/schemas";
import { WHATSAPP_ORDER_MESSAGE, whatsappLink } from "@/features/stationeries/whatsapp";

import { EntryBar } from "./EntryBar";
import { PRICE_SOURCE_LABEL, STOCK_LABEL } from "./CatalogTable";
import { formatDateTime } from "./StatusPanel";

const PAYMENT_LABEL: Record<string, string> = {
  pix: "Pix",
  credit_card: "Cartão de crédito",
  debit_card: "Débito",
  cash: "Dinheiro",
  boleto: "Boleto",
};

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || name.slice(0, 2).toUpperCase();

/** Perfil público (Pap08, mobile): dados que a papelaria informou, mais avaliações publicadas (S22, App23). */
export function PublicProfileView({ profile, reviews = [] }: { profile: PublicProfile; reviews?: ReviewView[] }) {
  const avg = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;
  const wa = profile.whatsapp ? whatsappLink(profile.whatsapp, WHATSAPP_ORDER_MESSAGE) : null;
  const payments = profile.paymentMethods.filter((m) => (PAYMENT_METHODS as readonly string[]).includes(m)).map((m) => PAYMENT_LABEL[m] ?? m);
  const delivery = [profile.offersPickup ? "Retirada na loja" : null, profile.offersDelivery ? "Entrega no bairro" : null].filter(Boolean);
  return (
    <main id="conteudo" className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col pb-28">
      <div className="px-5 pt-3 pb-1">
        <EntryBar />
      </div>
      <header className="bg-tinta mt-2 rounded-[28px] px-5 py-7 text-white">
        <div className="flex items-center gap-3.5">
          <span aria-hidden className="bg-verde-certo text-tinta grid size-14 shrink-0 place-items-center rounded-[18px] text-[18px] font-extrabold">
            {initials(profile.tradeName)}
          </span>
          <div className="min-w-0">
            <h1 className="text-[22px] leading-[1.15] font-extrabold tracking-[-0.02em]">{profile.tradeName}</h1>
            {profile.neighborhood ? <p className="text-[14px] font-semibold text-white/70">{profile.neighborhood}</p> : null}
          </div>
        </div>
        {profile.isDemo ? (
          <span className="bg-verde-certo text-tinta mt-4 inline-block rounded-botao px-3 py-1 text-[12px] font-extrabold">Demonstração</span>
        ) : null}
      </header>

      <div className="flex flex-col gap-3 px-5 pt-4">
        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-[18px] bg-white p-4">
            <h2 className="text-texto-3 mb-1 text-[12px] font-extrabold uppercase">Atendimento</h2>
            <p className="text-[14px] font-extrabold">{delivery.length > 0 ? delivery.join(" · ") : "indisponível"}</p>
          </div>
          <div className="rounded-[18px] bg-white p-4">
            <h2 className="text-texto-3 mb-1 text-[12px] font-extrabold uppercase">Pagamento</h2>
            <p className="text-[14px] font-extrabold">{payments.length > 0 ? payments.join(", ") : "indisponível"}</p>
          </div>
        </section>
        {profile.openingHours ? (
          <p className="rounded-[18px] bg-white p-4 text-[14px] font-bold">Horário: {profile.openingHours}</p>
        ) : null}
        {profile.areas.length > 0 ? (
          <section className="rounded-[18px] bg-white p-4">
            <h2 className="text-texto-3 mb-2 text-[12px] font-extrabold uppercase">Bairros atendidos</h2>
            <ul className="flex flex-wrap gap-2">
              {profile.areas.map((a) => (
                <li key={a} className="bg-campo capitalize rounded-botao px-3 py-1 text-[13px] font-bold">{a}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="catalogo-publico">
          <h2 id="catalogo-publico" className="mt-2 mb-2 text-[17px] font-extrabold">Itens e preços informados</h2>
          {profile.catalog.length === 0 ? (
            <p className="rounded-[18px] bg-white p-4 text-[14px] font-bold" data-testid="public-catalog-empty">
              Esta papelaria ainda não informou preços. Pergunte pelo WhatsApp.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {profile.catalog.map((i) => (
                <li key={i.id} className="rounded-[18px] bg-white p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[14px] font-bold">{i.name}</span>
                    <span className="text-[15px] font-extrabold">{formatBRL(i.priceCents)}</span>
                  </div>
                  <p className="text-texto-3 mt-1 text-[12px] font-semibold">
                    {PRICE_SOURCE_LABEL} · {formatDateTime(i.priceUpdatedAt)}
                    {i.stock !== "unknown" ? ` · Estoque informado: ${STOCK_LABEL[i.stock].toLowerCase()}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="text-texto-3 mt-2 text-[12px] font-semibold">Preço e estoque podem mudar. Confirme com a papelaria.</p>
        </section>

        <section aria-labelledby="avaliacoes-publicas">
          <h2 id="avaliacoes-publicas" className="mt-2 mb-2 text-[17px] font-extrabold">
            Avaliações{avg !== null ? ` · [${avg.toFixed(1)}] (média das últimas ${reviews.length})` : ""}
          </h2>
          {reviews.length === 0 ? (
            <p className="rounded-[18px] bg-white p-4 text-[14px] font-bold">Ainda sem avaliações de quem comprou aqui.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {reviews.slice(0, 10).map((r) => (
                <li key={r.id} className="rounded-[18px] bg-white p-4">
                  <p className="text-[14px] font-extrabold">
                    [{r.rating}/5]{r.tags.length > 0 ? ` · ${r.tags.map((t) => REVIEW_TAG_LABEL[t as ReviewTag] ?? t).join(", ")}` : ""}
                  </p>
                  {r.comment ? <p className="text-texto-2 mt-1 text-[13px] font-semibold">{r.comment}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="bg-papel border-linha fixed inset-x-0 bottom-0 border-t px-5 pt-3 pb-5">
        <div className="mx-auto max-w-[380px]">
          {wa ? (
            <a href={wa} target="_blank" rel="noreferrer" className="bg-verde-certo text-tinta flex h-14 w-full items-center justify-center rounded-botao text-base font-extrabold">
              Pedir lista pelo WhatsApp
            </a>
          ) : (
            <p className="bg-campo text-texto-2 flex h-14 items-center justify-center rounded-botao text-[14px] font-bold">WhatsApp indisponível</p>
          )}
        </div>
      </div>
    </main>
  );
}
