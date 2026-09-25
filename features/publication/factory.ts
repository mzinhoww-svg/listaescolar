import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { createPublicationDeps } from "../../supabase/functions/_shared/publication/composition";
import { decideListPublication, type PublicationDeps } from "../../supabase/functions/_shared/publication/decide";
import { systemClock } from "@/features/submissions/system-clock";
import type { PublicationDecider } from "@/features/submissions/ports";

type Raw = Parameters<typeof createPublicationDeps>[0]["rpc"];

/**
 * Deps reais da decisão de publicação. As portas em memória só existem com FAKE_PUBLICATION_FIXTURE válido e
 * APP_ENV explícito não produtivo; sem isso (produção até a S11) toda decisão vira `human_review`, registrada.
 */
export function buildPublicationDeps(): PublicationDeps {
  const e = process.env;
  return createPublicationDeps({
    env: { NODE_ENV: e.NODE_ENV, APP_ENV: e.APP_ENV, VERCEL_ENV: e.VERCEL_ENV, FAKE_PUBLICATION_FIXTURE: e.FAKE_PUBLICATION_FIXTURE },
    rpc: createAdminClient() as unknown as Raw,
    clock: systemClock,
    onAlert: (a) => console.error(JSON.stringify({ level: "error", fn: "publication", ...a })),
  });
}

export function buildPublicationDecider(): PublicationDecider {
  const deps = buildPublicationDeps();
  return { decide: (submissionId) => decideListPublication(submissionId, deps) };
}
