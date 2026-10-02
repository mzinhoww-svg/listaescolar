import { createAnalyticsClient, type AnalyticsClient } from "./client";
import { getAnalyticsConfigFromProcess } from "./config";
import { localIdStore } from "./consent";

let client: AnalyticsClient | null | undefined;

/** Cliente único do navegador; `null` sem `NEXT_PUBLIC_POSTHOG_KEY` (nada é criado, nada é enviado). */
export function getAnalyticsClient(): AnalyticsClient | null {
  if (typeof window === "undefined") return null;
  if (client === undefined) {
    const config = getAnalyticsConfigFromProcess();
    client = config.enabled
      ? createAnalyticsClient({ config, idStore: localIdStore, getCommon: deviceCommon })
      : null;
  }
  return client;
}

function deviceCommon(): Record<string, unknown> {
  const w = window.innerWidth;
  return { device_class: w < 640 ? "mobile" : w < 1024 ? "tablet" : "desktop" };
}

export function resetAnalyticsClientForTests() {
  client = undefined;
}
