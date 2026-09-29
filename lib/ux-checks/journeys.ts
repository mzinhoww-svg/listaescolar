export type JourneyRoute = { path: string; who: string; status?: number; skip?: string };
export type Journey = { nome: string; rotas: JourneyRoute[] };

const r = (path: string, who = "pub", extra: Partial<JourneyRoute> = {}): JourneyRoute => ({ path, who, ...extra });
const semSeed = (motivo: string) => ({ skip: `sem dado no seed (${motivo}); o seed cresce na Task 5` });

/**
 * Rotas por jornada, em ordem (spec §4). `{x}` é trocado pelo runner com dado do banco local; sem dado a rota
 * é pulada e registrada. Todo `app/**\/page.tsx` precisa aparecer aqui (tests/ux-checks/journeys.test.ts).
 */
export const JOURNEYS: Record<string, Journey> = {
  J1: { nome: "Família acha a lista", rotas: [r("/"), r("/escolas"), r("/escolas/{inep}"), r("/escolas/{inep}/{serie}?ano=2027"), r("/l/{code}"), r("/l/{code}/qr")] },
  J2: {
    nome: "Família compra",
    rotas: [
      r("/carrinho/novo", "familia"), r("/carrinho/{cartId}", "familia"), r("/ir-para/{cartId}/{retailer}", "familia"),
      r("/carrinho/{cartId}/checkout", "familia"), r("/cotacao", "familia"), r("/cotacao/nova", "familia"), r("/cotacao/{leadCode}", "familia"), r("/conta/compras", "familia"),
    ],
  },
  J3: {
    nome: "Família entra e cuida da conta",
    rotas: [
      r("/entrar"), r("/conta", "familia"), r("/conta/alunos/novo", "familia"), r("/conta/alunos/{studentId}/editar", "familia", semSeed("aluno")),
      r("/conta/listas-salvas", "familia"), r("/conta/carrinhos", "familia"), r("/conta/notificacoes", "familia"), r("/conta/privacidade", "familia"),
    ],
  },
  J4: { nome: "Família envia a lista da escola", rotas: [r("/enviar-lista", "familia"), r("/enviar-lista/{submissionId}", "familia"), r("/enviar-lista/{submissionId}/revisar", "familia")] },
  J5: { nome: "Escola assume e publica", rotas: [r("/escolas/{inep}/reivindicar", "familia"), r("/escolas/{inep}/reivindicar/confirmar", "familia"), r("/escola", "escola"), r("/escola/listas/nova", "escola")] },
  J6: {
    nome: "Papelaria vende",
    rotas: [
      r("/cadastrar-papelaria", "familia"), r("/papelaria", "papelaria"), r("/papelaria/areas", "papelaria"), r("/papelaria/catalogo", "papelaria"), r("/papelaria/creditos", "papelaria"),
      r("/papelaria/creditos/faturas/{invoiceId}", "papelaria", semSeed("fatura")), r("/papelaria/leads", "papelaria"), r("/papelaria/leads/{leadCode}", "papelaria"),
      r("/papelaria/desempenho", "papelaria"), r("/papelarias/{slug}"),
    ],
  },
  J7: {
    nome: "Equipe opera",
    rotas: [
      ...["", "/revisao", "/reivindicacoes", "/papelarias", "/denuncias", "/contestacoes", "/planos", "/ia", "/repasses", "/inadimplencia", "/campanhas", "/parceiros", "/importacoes", "/eventos", "/auditoria"].map((x) => r(`/admin${x}`, "admin")),
      r("/admin/revisao/{reviewId}", "admin", semSeed("item de revisão")), r("/admin/listas/{listId}", "admin", semSeed("lista")),
      r("/admin/reivindicacoes/{claimId}", "admin", semSeed("reivindicação")), r("/admin/papelarias/{stationeryId}", "admin", semSeed("id da papelaria")),
      r("/admin/denuncias/{reportId}", "admin", semSeed("denúncia")), r("/admin/importacoes/{batchId}", "admin", semSeed("lote de importação")),
      r("/admin/parceiros/{partnerId}", "admin", semSeed("id do parceiro")),
    ],
  },
  J8: {
    nome: "Parceiro B2B integra",
    rotas: [
      r("/parceiros"), r("/parceiros/termos"), r("/parceiros/docs"),
      ...["", "/api", "/docs", "/widget", "/webhooks", "/campanhas", "/campanhas/nova", "/insights", "/faturamento", "/conta"].map((x) => r(`/b2b${x}`, "parceiro")),
    ],
  },
  J9: {
    nome: "Sistema e bordas",
    rotas: [
      r("/403", "pub", { status: 403 }), r("/rota-inexistente-s29", "pub", { status: 404 }), r("/pesquisa"), r("/pesquisa/privacidade"), r("/pesquisa/resultados"),
      r("/pesquisa/resultados/login"), r("/termos"), r("/privacidade"), r("/sobre"), r("/como-funciona"),
    ],
  },
};
