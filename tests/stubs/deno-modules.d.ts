// Especificador de import da Edge Function (Deno) que o TypeScript do app não resolve: o teste do worker o troca por um stub.
declare module "npm:@supabase/supabase-js@2" {
  export function createClient(url: string, key: string, options?: unknown): import("@supabase/supabase-js").SupabaseClient;
}
