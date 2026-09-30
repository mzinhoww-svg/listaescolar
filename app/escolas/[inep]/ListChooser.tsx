import Link from "next/link";

import { buttonClass } from "@/components/ui/Button";
import { sendListHref } from "@/features/submissions/href";

import { PublishedShortcuts, type PublishedShortcut } from "./PublishedShortcuts";

type Props = {
  inep: string;
  /** Séries e anos com lista publicada (dado real). Ausente = a consulta falhou: nunca afirmar "nenhuma". */
  publishedShortcuts?: readonly PublishedShortcut[];
};

/**
 * Uma só forma de chegar à lista (UX-017): os atalhos das listas publicadas levam direto à lista, sem seletor nem passo
 * extra. Série sem lista não é um beco: o caminho é "Enviar a lista desta escola" (UX-012).
 */
export function ListChooser({ inep, publishedShortcuts }: Props) {
  const send = sendListHref({ inep });
  const hasLists = publishedShortcuts !== undefined && publishedShortcuts.length > 0;
  return (
    <section aria-labelledby="lista" className="flex flex-col gap-3">
      <h2 id="lista" className="text-base font-extrabold">
        Lista de material
      </h2>
      {publishedShortcuts === undefined ? (
        <p role="status" className="bg-white text-texto-2 rounded-[22px] p-4 text-[13px] leading-[1.4] font-medium">
          Não foi possível consultar as listas agora. Tente de novo em instantes.
        </p>
      ) : hasLists ? (
        <>
          <PublishedShortcuts inep={inep} items={publishedShortcuts} />
          <p className="text-texto-2 text-[13px] leading-[1.4] font-medium">Não achou a série do seu filho? Ela ainda não tem lista publicada.</p>
          <Link href={send} className={buttonClass("outline")}>
            Enviar a lista desta escola
          </Link>
        </>
      ) : (
        <div className="flex flex-col gap-3 rounded-[22px] bg-white p-4">
          <div>
            <p className="text-[15px] font-extrabold">Ainda não há lista publicada</p>
            <p className="text-texto-2 mt-1 text-[13px] leading-[1.4] font-medium">
              Se você tem a lista que a escola entregou, envie: a equipe revisa antes de publicar.
            </p>
          </div>
          <Link href={send} className={buttonClass("outline")}>
            Enviar a lista desta escola
          </Link>
        </div>
      )}
    </section>
  );
}
