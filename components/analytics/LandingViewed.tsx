"use client";

import { useEffect, useRef } from "react";

import { routeTemplate } from "@/lib/analytics/route";
import { track } from "@/lib/analytics/track";

const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

/** `landing_viewed`: caminho normalizado, só os cinco `utm_*` e só o domínio do referrer. Nada mais da URL. */
export function LandingViewed() {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const q = new URLSearchParams(window.location.search);
    const utm = Object.fromEntries(UTM.flatMap((k) => (q.get(k) ? [[k, q.get(k) as string]] : [])));
    let referrer_domain: string | undefined;
    try {
      const host = document.referrer ? new URL(document.referrer).hostname : "";
      if (host && host !== window.location.hostname) referrer_domain = host.toLowerCase();
    } catch {
      referrer_domain = undefined;
    }
    track("landing_viewed", { path: routeTemplate(window.location.pathname), ...utm, ...(referrer_domain ? { referrer_domain } : {}) });
  }, []);
  return null;
}
