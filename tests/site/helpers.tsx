import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";

import SiteLayout from "@/app/(site)/layout";

export const CHANNELS = {
  retailers: [
    { slug: "amazon", name: "Amazon" },
    { slug: "mercado-livre", name: "Mercado Livre" },
  ],
  hasStationeries: false,
};

export const channelsMock = vi.fn();

/** Renderiza a página dentro do layout do grupo (site), como o Next faz. */
export async function renderInSite(page: () => ReactElement | Promise<ReactElement>) {
  const el = await page();
  return render(<SiteLayout>{el}</SiteLayout>);
}

export const SITE_ROUTES = ["/", "/como-funciona", "/sobre", "/termos", "/privacidade"] as const;

export async function loadPage(route: (typeof SITE_ROUTES)[number]) {
  switch (route) {
    case "/":
      return (await import("@/app/(site)/page")).default;
    case "/como-funciona":
      return (await import("@/app/(site)/como-funciona/page")).default;
    case "/sobre":
      return (await import("@/app/(site)/sobre/page")).default;
    case "/termos":
      return (await import("@/app/(site)/termos/page")).default;
    case "/privacidade":
      return (await import("@/app/(site)/privacidade/page")).default;
  }
}
