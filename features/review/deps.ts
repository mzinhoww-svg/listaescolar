import "server-only";

import { buildPublicationDeps } from "@/features/publication/factory";
import { createAdminClient } from "@/lib/supabase/admin";

import { createParentCopyService } from "./parent-copy";
import { createReviewRepository } from "./repository";
import { createSchoolLabelReader, type SchoolLabelReader } from "./school-labels";
import { createReviewService } from "./service";

/** Serviço da revisão com as portas da S09 (memória só com FAKE_PUBLICATION_FIXTURE + APP_ENV local/development). */
export function buildReviewService() {
  const pub = buildPublicationDeps();
  return createReviewService({
    store: createReviewRepository(createAdminClient({ fresh: true })).store,
    publication: { publisher: pub.publisher, context: pub.context, clock: pub.clock, settings: pub.settings },
    onAlert: (a) => console.error(JSON.stringify({ level: "error", fn: "review_publish", ...a })),
  });
}

export function buildSchoolLabelReader(): SchoolLabelReader | null {
  const e = process.env;
  return createSchoolLabelReader({ NODE_ENV: e.NODE_ENV, APP_ENV: e.APP_ENV, VERCEL_ENV: e.VERCEL_ENV, FAKE_PUBLICATION_FIXTURE: e.FAKE_PUBLICATION_FIXTURE });
}

export const buildParentCopyService = () => createParentCopyService(createAdminClient({ fresh: true }));
