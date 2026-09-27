import * as Sentry from "@sentry/nextjs";

import { redactEvent } from "@/lib/observability/sentry-redact";

// O next.config.ts expõe SENTRY_DSN como NEXT_PUBLIC_SENTRY_DSN só quando existe.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// Inerte sem DSN. Sem dados pessoais (dataCollection desligado; o SDK 11 substituiu sendDefaultPii).
// `beforeSend`: defesa em profundidade sobre o que ainda pode vir em texto livre (ver
// `lib/observability/sentry-redact.ts`) — o mesmo redator do servidor.
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
  });
}
