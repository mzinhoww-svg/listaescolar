import { buildSearchUrl, RedirectTargetError, type RetailerTarget } from "./redirect-target";

export type AffiliateEnv = {
  MELI_AFFILIATE_ID?: string;
  /** Opcional: só entra na URL se existir (matt_word). */
  MELI_AFFILIATE_WORD?: string;
  AMAZON_ASSOCIATE_TAG?: string;
};
export type RedirectResult = { url: string; affiliateApplied: boolean };

export interface AffiliateLinkBuilder {
  build(retailer: RetailerTarget | null | undefined, query: string): RedirectResult;
}

const ID_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

function cleanId(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && ID_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * Amazon: `tag=<associate tag>`. Mercado Livre: `matt_tool=<MELI_AFFILIATE_ID>` e, só se
 * `MELI_AFFILIATE_WORD` existir, `matt_word` (formato a confirmar com o programa real). Sem ID válido a URL sai simples e `affiliateApplied = false`.
 */
export function createAffiliateLinkBuilder(env: AffiliateEnv): AffiliateLinkBuilder {
  return {
    build(retailer, query) {
      if (!retailer) throw new RedirectTargetError("unknown_retailer");
      const url = buildSearchUrl(retailer, query);
      let applied = false;
      if (retailer.affiliateKind === "amazon") {
        const tag = cleanId(env.AMAZON_ASSOCIATE_TAG);
        if (tag) {
          url.searchParams.set("tag", tag);
          applied = true;
        }
      } else if (retailer.affiliateKind === "mercadolivre") {
        const id = cleanId(env.MELI_AFFILIATE_ID);
        if (id) {
          url.searchParams.set("matt_tool", id);
          const word = cleanId(env.MELI_AFFILIATE_WORD);
          if (word) url.searchParams.set("matt_word", word);
          applied = true;
        }
      }
      return { url: url.toString(), affiliateApplied: applied };
    },
  };
}

export function buildRetailerRedirect(
  retailer: RetailerTarget | null | undefined,
  query: string,
  env: AffiliateEnv,
): RedirectResult {
  return createAffiliateLinkBuilder(env).build(retailer, query);
}
