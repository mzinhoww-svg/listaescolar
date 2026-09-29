/** Dados jurídicos ainda não definidos: `null` vira placeholder visível. Editado pela S17 e pelo jurídico. */
export type Legal = {
  companyName: string | null;
  cnpj: string | null;
  dpoEmail: string | null;
  contactEmail: string | null;
  retention: string | null;
  claimRetention: string | null;
  auditRetention: string | null;
  legalBasis: string | null;
  operators: string | null;
  /** Operador da medição de uso (PostHog): a definir e validar juridicamente. */
  analyticsOperator: string | null;
  lastUpdated: string | null;
};

export const LEGAL: Legal = {
  companyName: null,
  cnpj: null,
  dpoEmail: null,
  contactEmail: null,
  // S17: valores técnicos provisórios de `retention_policies` (migration 0605), editáveis sem mudança de código;
  // revisão jurídica pendente, como o resto desta página. `auditRetention` fica placeholder: esta fatia não criou
  // rotina de exclusão para `audit_log` (é imutável por desenho; só o job de retenção de evidência/token roda).
  retention: "enquanto sua conta existir. Você pode excluir sua conta e os dados pessoais quando quiser, em \"Privacidade e dados\" na sua conta; o registro que mantemos (cotações e reivindicações de escola) continua, mas anonimizado",
  claimRetention: "um prazo técnico definido internamente a partir da decisão da reivindicação, ajustável sem mudança de código; revisão jurídica pendente",
  auditRetention: null,
  legalBasis: null,
  operators: null,
  analyticsOperator: null,
  lastUpdated: null,
};

export const PRELIMINARY_BANNER = "Versão preliminar. Texto em revisão jurídica.";

export type Part = string | { key: keyof Legal; label: string };
export type LegalSection = { title: string; paragraphs: Part[][] };

const dpo: Part = { key: "dpoEmail", label: "e-mail do encarregado de dados" };

export const TERMS_SECTIONS: LegalSection[] = [
  {
    title: "O serviço",
    paragraphs: [["A ListaCerta mostra a lista oficial da escola e compara preços em lojas. Não vende material escolar."]],
  },
  {
    title: "Listas",
    paragraphs: [["Listas publicadas pela escola ou revisadas pelo nosso time. Confira sempre com a escola em caso de dúvida."]],
  },
  {
    title: "Compras",
    paragraphs: [["A compra acontece na loja escolhida, com as regras dela."]],
  },
  {
    title: "Links de loja",
    paragraphs: [["Ao comprar por um link de loja, podemos receber comissão das lojas; o preço não muda para você."]],
  },
  {
    title: "Conta",
    paragraphs: [["Você é responsável pelo acesso à sua conta, por e-mail ou conta Google."]],
  },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: "Quem somos",
    paragraphs: [
      [{ key: "companyName", label: "razão social" }, ", CNPJ ", { key: "cnpj", label: "CNPJ" }, ", responsável pelos dados tratados neste site."],
    ],
  },
  {
    title: "Dados que coletamos",
    paragraphs: [
      ["Conta: e-mail (login por e-mail ou conta Google) e nome de exibição, quando existir."],
      ["Listas enviadas: o arquivo da lista (PDF ou imagem), a escola, a série e o ano, com o registro do seu consentimento (finalidade, versão do texto e data)."],
      ["Uso: carrinhos que você monta e cliques em links de loja, ligados à sua conta."],
      ["Pedidos de cotação: escola, série, ano, número de itens, bairro (se informado) e o registro do consentimento. O pedido é compartilhado com a papelaria escolhida. Se o pedido seguir por WhatsApp, o número do responsável fica visível para a papelaria, e a conversa passa a ocorrer fora da ListaCerta, sob as regras do WhatsApp e da papelaria."],
      ["Reivindicação de escola: nome, cargo, e-mail de contato e nota do solicitante, os documentos enviados como evidência (o arquivo e o hash dele), o registro do aceite (versão do texto e data) e os passos da análise. Prazo de guarda desses documentos: ", { key: "claimRetention", label: "prazo de guarda dos documentos de reivindicação" }, "."],
      ["Papelarias credenciadas: CNPJ, razão social, endereço, telefone, WhatsApp e e-mail da papelaria, informados no credenciamento."],
      ["Trilha de auditoria: registramos ações sensíveis com a data, o autor e um hash do endereço de IP (nunca o IP em claro). Prazo de guarda: ", { key: "auditRetention", label: "prazo de guarda da trilha de auditoria" }, "."],
      ["Não pedimos documento nem nome completo de estudante."],
    ],
  },
  {
    title: "Dados de crianças",
    paragraphs: [
      [
        "Quem tem conta pode cadastrar um estudante para salvar listas por aluno. O cadastro pede só apelido e série, informados pelo responsável — nunca nome completo, documento, foto nem outro dado do estudante. Esse cadastro nunca chega à papelaria nem a terceiros.",
      ],
    ],
  },
  {
    title: "Com quem os dados passam",
    paragraphs: [
      ["Usamos o Supabase (banco de dados, autenticação e arquivos), a Vercel (hospedagem) e um provedor de IA, acessado pelo OpenRouter, que lê os arquivos de lista enviados para extrair os itens."],
      ["Operadores, contratos e local de tratamento: ", { key: "operators", label: "operadores e contratos" }, "."],
      ["Ao abrir um link de loja, você sai da ListaCerta e passa às regras da loja."],
    ],
  },
  {
    title: "Medição de uso",
    paragraphs: [
      [
        "Se você aceitar, medimos como o site é usado (páginas vistas, busca, cliques de compra) para melhorar as listas. Os eventos não levam nome, e-mail, telefone, texto digitado nem dado de estudante; levam só identificadores como o código da escola (INEP) e a série. Antes da sua escolha nada é enviado, e recusar não tira nenhuma função do site.",
      ],
      ["Operador da medição de uso: ", { key: "analyticsOperator", label: "operador da medição de uso (PostHog)" }, "."],
      ["Você pode mudar a escolha a qualquer momento nesta página, quando a medição estiver ativa."],
    ],
  },
  {
    title: "Base legal",
    paragraphs: [["Base legal do tratamento: ", { key: "legalBasis", label: "base legal" }, "."]],
  },
  {
    title: "Por quanto tempo",
    paragraphs: [["Prazo de retenção: ", { key: "retention", label: "prazo de retenção" }, "."]],
  },
  {
    title: "Seus direitos",
    paragraphs: [
      [
        "Quem tem conta pode baixar uma cópia dos próprios dados e revogar um consentimento em \"Privacidade e dados\", dentro da conta. A exclusão da conta também fica lá: apaga de verdade o que é pessoal e anonimiza o registro que mantemos.",
      ],
      ["Para qualquer outro pedido de acesso, correção ou exclusão, fale com o encarregado: ", dpo, "."],
    ],
  },
];
