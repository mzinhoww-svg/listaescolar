/**
 * D-158 (S19): este arquivo tinha 411 linhas. Dividido em arquivos-irmãos por responsabilidade, mesmo padrão do
 * D-057 (S18): `repository-shared.ts` (guarda/erro comuns), `repository-apply.ts` (cadastro, B2B00),
 * `repository-overview.ts` (leitura do próprio parceiro, B2B01/B2B02), `repository-keys.ts` (chaves, B2B02),
 * `repository-admin.ts` (Admin15). Este arquivo continua sendo o ÚNICO ponto de import
 * (`@/features/b2b/repository`) — reexporta tudo dos irmãos; nenhum import de chamador muda.
 */
export { requireActor, fail, failMasked } from "./repository-shared";
export { applyPartner, type ApplyPartnerPayload } from "./repository-apply";
export {
  getMyPartner,
  listPartnerEvents,
  myPartnerId,
  overview,
  partnerHeader,
  type PartnerEvent,
  type PartnerHeader,
  type PartnerOverview,
} from "./repository-overview";
export { createKey, getKeyEnvironment, revokeKey, rotateKey, type CreatedKeyRecord } from "./repository-keys";
export { adminRevokeKey, decide, getPartner, listPartners, type AdminPartnerRow } from "./repository-admin";
