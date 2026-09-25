import { statusLabel } from "@/features/schools/search/status";
import type { SchoolProfile } from "@/features/schools/search/types";

/** Avisos da primeira dobra do perfil: perfil suspenso e dado demonstrativo (logo abaixo do cabeçalho). */
export function ProfileNotices({ school }: { school: SchoolProfile }) {
  const suspended = school.verificationStatus === "suspended";
  if (!suspended && !school.isDemo) return null;
  return (
    <div className="flex flex-col gap-2.5">
      {suspended ? (
        <p role="note" className="bg-erro-fundo text-erro-texto rounded-campo px-3 py-3 text-[13px] leading-[1.4] font-bold">
          {statusLabel("suspended", false).description}
        </p>
      ) : null}
      {school.isDemo ? (
        <p role="note" className="bg-demo-fundo text-demo-texto rounded-campo px-3 py-3 text-[13px] leading-[1.4] font-bold">
          Demonstração: dados fictícios, sem valor real.
        </p>
      ) : null}
    </div>
  );
}
