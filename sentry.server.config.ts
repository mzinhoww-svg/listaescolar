import * as Sentry from "@sentry/nextjs";

import { redactBreadcrumb, redactEvent } from "@/lib/observability/sentry-redact";

const dsn = process.env.SENTRY_DSN;

// Inerte sem DSN. Sem dados pessoais (dataCollection desligado; o SDK 11 substituiu sendDefaultPii).
// `beforeSend`/`beforeSendTransaction`: defesa em profundidade sobre o que ainda pode vir em texto livre
// (mensagem, extra, migalhas) — ver `lib/observability/sentry-redact.ts`.
if (dsn) {
  Sentry.init({
    dsn,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    tracesSampleRate: 0.1,
    beforeSend: redactEvent,
    beforeBreadcrumb: redactBreadcrumb,
    beforeSendTransaction: redactEvent,
  });
}
