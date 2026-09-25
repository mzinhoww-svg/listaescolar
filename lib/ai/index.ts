import "server-only";
// IA só por aqui: regra de negócio nunca importa um provedor direto. Fonte única em supabase/functions/_shared/ai.
export * from "../../supabase/functions/_shared/ai/types";
export * from "../../supabase/functions/_shared/ai/errors";
export * from "../../supabase/functions/_shared/ai/json";
export * from "./router";
export * from "./settings";
export * from "./providers/openrouter";
export * from "./providers/fake";
