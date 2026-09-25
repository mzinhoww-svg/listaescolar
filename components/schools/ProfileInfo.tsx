import { statusLabel } from "@/features/schools/search/status";
import { NETWORK_LABEL, type SchoolProfile } from "@/features/schools/search/types";

import { formatPhone } from "./format";

/** Dados básicos: só o que existe (telefone/endereço ausentes são omitidos). E-mail nunca é exibido. */
export function ProfileInfo({ school }: { school: SchoolProfile }) {
  const status = statusLabel(school.verificationStatus, school.isDemo);
  const rows: [string, string][] = [["Rede", NETWORK_LABEL[school.network]]];
  if (school.address) rows.push(["Endereço", school.address]);
  if (school.phone) rows.push(["Telefone", formatPhone(school.phone)]);
  return (
    <section aria-labelledby="dados" className="flex flex-col gap-3">
      <h2 id="dados" className="text-base font-extrabold">
        Dados básicos
      </h2>
      <dl className="flex flex-col gap-3 rounded-[22px] bg-white p-4">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5">
            <dt className="text-texto-3 text-xs font-semibold">{k}</dt>
            <dd className="text-[15px] font-bold">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="bg-campo text-texto-2 rounded-campo px-3 py-3 text-xs leading-[1.4] font-semibold">
        {status.description}
        {status.demoLabel ? " Demonstração: dados fictícios, sem valor real." : ""}
      </p>
    </section>
  );
}
