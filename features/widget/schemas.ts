import { z } from "zod";

// Zod na fronteira da configuração do widget (S25). `cartTargetDomain` é HOSTNAME PURO — sem esquema, caminho,
// porta ou credencial (anti open-redirect: o widget monta `https://<domínio>/...` sozinho).

export const SaveWidgetConfigInputSchema = z
  .object({
    accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "cor precisa ser hexadecimal, ex. #0B6B4A"),
    cartTargetDomain: z
      .string()
      .max(255)
      .regex(/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/, "informe só o domínio, sem https:// nem caminho"),
    enabled: z.boolean(),
  })
  .strict();
export type SaveWidgetConfigInput = z.infer<typeof SaveWidgetConfigInputSchema>;
