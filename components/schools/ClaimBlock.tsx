import Link from "next/link";

import type { VerificationStatus } from "@/features/schools/search/types";

const COPY: Record<VerificationStatus, string | null> = {
  registered: "Ninguém administra esta página ainda. Reivindique para publicar e manter as listas oficiais.",
  claimed: "Este perfil já tem uma reivindicação em andamento. Se você também trabalha na escola, envie a sua.",
  verified: "Este perfil já tem um responsável verificado. Se você também trabalha na escola, envie a sua.",
  suspended: null,
};

export function ClaimBlock({ inep, status }: { inep: string; status: VerificationStatus }) {
  const copy = COPY[status];
  if (!copy) return null;
  return (
    <section aria-labelledby="reivindicar" className="bg-campo flex flex-col gap-3 rounded-3xl p-5">
      <h2 id="reivindicar" className="text-base font-extrabold">
        Você trabalha nesta escola?
      </h2>
      <p className="text-texto-2 text-[13px] leading-[1.4] font-medium">{copy}</p>
      <Link
        href={`/escolas/${inep}/reivindicar`}
        className="border-tinta text-tinta focus-visible:outline-verde-fundo rounded-botao flex h-[52px] items-center justify-center border-[1.5px] text-base font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Reivindicar perfil
      </Link>
    </section>
  );
}
