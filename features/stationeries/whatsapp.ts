import { normalizePhone } from "./phone";

/** Link `wa.me` (só abre a conversa no aparelho da pessoa; nada é enviado ou cobrado pela plataforma). */
export function whatsappLink(phone: string, text: string): string | null {
  const e164 = normalizePhone(phone);
  if (!e164) return null;
  return `https://wa.me/${e164.slice(1)}?text=${encodeURIComponent(text)}`;
}

export const WHATSAPP_TEST_MESSAGE =
  "Teste de contato do cadastro da papelaria na ListaCerta. Pode ignorar esta mensagem.";
export const WHATSAPP_ORDER_MESSAGE = "Olá! Vim pela ListaCerta e gostaria de pedir a lista de material escolar.";
