import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

// Inerte sem DSN. Sem dados pessoais (dataCollection desligado; o SDK 11 substituiu sendDefaultPii).
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
  });
}
