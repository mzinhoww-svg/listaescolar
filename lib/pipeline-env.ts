// Validação das flags do pipeline sem "server-only": também roda em instrumentation.register() (boot).
import { demoConfigError, demoEnabled } from "../supabase/functions/_shared/demo-lock";

const read = () => ({ DEMO_PIPELINE: process.env.DEMO_PIPELINE, APP_ENV: process.env.APP_ENV, VERCEL_ENV: process.env.VERCEL_ENV });

/** Demonstração ligada? Só com DEMO_PIPELINE=1 e APP_ENV explícito não produtivo; ausente = desligada. */
export function isDemoEnabled(): boolean {
  return demoEnabled(read());
}

/** Falha cedo (boot) se o demo foi pedido num ambiente que não o permite. */
export function assertPipelineEnv(): void {
  const error = demoConfigError(read());
  if (error) throw new Error(`Configuração inválida do pipeline: ${error}`);
}
