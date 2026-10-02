"use client";

import { useEffect, useState } from "react";

import { getAnalyticsConfigFromProcess } from "@/lib/analytics/config";
import { deny, getConsent, grant, listenForConsentChanges, subscribe, syncConsentCookie } from "@/lib/analytics/consent";
import { getAnalyticsClient } from "@/lib/analytics/instance";
import type { Consent } from "@/lib/analytics/client";

import { ConsentNotice } from "./ConsentNotice";

const whenIdle = (cb: () => void) => {
  if (typeof requestIdleCallback === "function") requestIdleCallback(cb);
  else setTimeout(cb, 1);
};

/**
 * Liga a medição depois que a página já está utilizável (`requestIdleCallback`). Sem `NEXT_PUBLIC_POSTHOG_KEY`
 * não renderiza nada e não cria cliente. O layout só o inclui quando há chave.
 */
export function AnalyticsProvider() {
  const enabled = getAnalyticsConfigFromProcess().enabled;
  const [consent, setConsent] = useState<Consent | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let unsubscribe = () => {};
    let stopStorage = () => {};
    const onHide = () => getAnalyticsClient()?.flush();
    whenIdle(() => {
      if (!alive) return;
      const client = getAnalyticsClient();
      if (!client) return;
      const initial = getConsent();
      client.setConsent(initial);
      setConsent(initial);
      // Renova (aceite) ou remove (recusa/limpeza) o cookie de estado lido pelo servidor.
      syncConsentCookie(initial);
      stopStorage = listenForConsentChanges();
      unsubscribe = subscribe((c) => {
        client.setConsent(c);
        setConsent(c);
      });
      window.addEventListener("pagehide", onHide);
    });
    return () => {
      alive = false;
      unsubscribe();
      stopStorage();
      window.removeEventListener("pagehide", onHide);
    };
  }, [enabled]);

  if (!enabled || consent !== "unset") return null;
  return <ConsentNotice onAccept={grant} onDeny={deny} />;
}
