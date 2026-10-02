"use client";

import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/Button";
import type { Consent } from "@/lib/analytics/client";
import { getAnalyticsConfigFromProcess } from "@/lib/analytics/config";
import { deny, getConsent, grant, revoke, subscribe } from "@/lib/analytics/consent";

const LABEL: Record<Consent, string> = {
  unset: "Você ainda não escolheu. Nada é enviado.",
  granted: "Medição de uso aceita.",
  denied: "Medição de uso recusada. Nada é enviado.",
};

/** Escolha de medição de uso na página de privacidade. Some quando a medição está desligada (sem chave). */
export function ConsentPreferences() {
  const enabled = getAnalyticsConfigFromProcess().enabled;
  // Servidor e primeira renderização: `null` (sem tocar storage); depois, a escolha guardada.
  const state = useSyncExternalStore<Consent | null>(subscribe, getConsent, () => null);
  if (!enabled || state === null) return null;
  return (
    <section aria-label="Sua escolha sobre a medição de uso" className="bg-white rounded-card mt-8 flex flex-col gap-3 px-5 py-4">
      <p className="text-sm font-extrabold" aria-live="polite">
        {LABEL[state]}
      </p>
      <div className="flex flex-wrap gap-2">
        {state !== "granted" ? <Button onClick={grant}>Aceitar medição</Button> : null}
        {state === "granted" ? (
          <Button variant="outline" onClick={revoke}>
            Retirar o aceite
          </Button>
        ) : state === "unset" ? (
          <Button variant="outline" onClick={deny}>
            Recusar
          </Button>
        ) : null}
      </div>
    </section>
  );
}
