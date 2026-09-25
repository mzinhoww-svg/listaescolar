// Stub de `npm:@supabase/supabase-js@2` só para o teste do worker (Deno) sob Node: o teste define `globalThis.__denoSupabaseClient`.
export const createClient = (): unknown => (globalThis as unknown as { __denoSupabaseClient: unknown }).__denoSupabaseClient;
