// Decisão de publicação automática (S09). Fonte única em supabase/functions/_shared/publication (o worker Deno usa o mesmo código).
export * from "./rules";
export * from "./ports";
export {
  PUBLISH_EXPIRY_SECONDS,
  PUBLISH_LEASE_SECONDS,
  PUBLISH_TIMEOUT_MS,
  decideListPublication,
  resumePublication,
  type DecideResult,
  type PublicationDeps,
} from "../../supabase/functions/_shared/publication/decide";
export { runPublicationSweep, type SweepSummary } from "../../supabase/functions/_shared/publication/sweep";
export { createPublicationSettings, type PublicationSettingsProvider } from "../../supabase/functions/_shared/publication/settings";
export { createPublicationDeps, publicationIsDemo, type PublicationEnv } from "../../supabase/functions/_shared/publication/composition";
