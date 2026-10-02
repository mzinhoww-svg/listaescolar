// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { resolvePaymentProvider } from "@/features/billing/payments/factory";
import { createAffiliateLinkBuilder } from "@/features/cart/affiliate";
import type { RetailerTarget } from "@/features/cart/redirect-target";
import { FLAG_NAMES, flagOn, posthogKey, type FlagKey } from "@/lib/feature-flags";
import { assertDemoSafe, STAGING_REF } from "@/scripts/import-inep-lib";

import { createPublicationDeps } from "../supabase/functions/_shared/publication/composition";
import { FakeClock } from "./helpers/fake-clock";

const KEYS = Object.keys(FLAG_NAMES) as FlagKey[];

describe("flags: padrão desligado", () => {
  it.each(KEYS)("%s: ausente, vazio, 0, true e ' 1' não ligam; só '1'", (k) => {
    const n = FLAG_NAMES[k];
    for (const v of [undefined, "", "0", "true", "yes", " 1", "1 "]) expect(flagOn({ [n]: v }, k)).toBe(false);
    expect(flagOn({}, k)).toBe(false);
    expect(flagOn({ [n]: "1" }, k)).toBe(true);
  });
  it("PostHog só com chave não vazia", () => {
    expect(posthogKey({})).toBeNull();
    expect(posthogKey({ NEXT_PUBLIC_POSTHOG_KEY: "  " })).toBeNull();
    expect(posthogKey({ NEXT_PUBLIC_POSTHOG_KEY: "phc_x" })).toBe("phc_x");
  });
});

const ML: RetailerTarget = {
  slug: "mercadolivre",
  baseUrl: "https://www.mercadolivre.com.br",
  searchUrlTemplate: "https://lista.mercadolivre.com.br/{query}",
  affiliateKind: "mercadolivre",
  isActive: true,
};

describe("afiliados", () => {
  it("IDs configurados mas flag desligada: link sem tag", () => {
    const r = createAffiliateLinkBuilder({ MELI_AFFILIATE_ID: "abc", AMAZON_ASSOCIATE_TAG: "t-20" }).build(ML, "caderno");
    expect(r.affiliateApplied).toBe(false);
    expect(r.url).not.toContain("matt_tool");
  });
  it("flag ligada + ID: aplica", () => {
    const r = createAffiliateLinkBuilder({ AFFILIATE_TAGS_ENABLED: "1", MELI_AFFILIATE_ID: "abc" }).build(ML, "caderno");
    expect(r.affiliateApplied).toBe(true);
  });
});

describe("cobrança", () => {
  it("sem PAYMENTS_PIX_ENABLED não há provedor para carteira real (indisponível)", () => {
    expect(resolvePaymentProvider({}, { isDemo: false })).toBeNull();
  });
});

describe("publicação automática", () => {
  const rpc = { rpc: vi.fn(async () => ({ data: null, error: null })) };
  it("sem AUTO_PUBLISH_ENABLED: sem publicador (revisão humana); com a flag: publicador real", () => {
    expect(createPublicationDeps({ env: { APP_ENV: "production" }, rpc, clock: new FakeClock() }).publisher).toBeNull();
    expect(createPublicationDeps({ env: { APP_ENV: "production", AUTO_PUBLISH_ENABLED: "1" }, rpc, clock: new FakeClock() }).publisher).not.toBeNull();
  });
});

describe("demonstração fora de produção", () => {
  it("recusa APP_ENV/VERCEL_ENV/NODE_ENV=production e alvo não local/staging", () => {
    const ok = `https://${STAGING_REF}.supabase.co`;
    expect(() => assertDemoSafe(ok, {})).not.toThrow();
    for (const env of [{ APP_ENV: "production" }, { VERCEL_ENV: "Production" }, { NODE_ENV: "production" }])
      expect(() => assertDemoSafe(ok, env)).toThrow(/produção/);
    expect(() => assertDemoSafe("https://outroprojeto.supabase.co", {})).toThrow();
  });
});
