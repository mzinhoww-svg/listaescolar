// Reexporta a Server Action de domínio (features/b2b/actions.ts). Mesmo padrão de outras rotas: a lógica mora no
// domínio, a rota só liga o formulário à action. Sem `"use server"` aqui: um arquivo com essa diretiva só pode
// exportar funções assíncronas (regra do compilador do Next) — `applyPartnerAction` já é uma Server Action (o
// `"use server"` mora em `features/b2b/actions.ts`); este arquivo só encaminha a referência.
export { applyPartnerAction } from "@/features/b2b/actions";
