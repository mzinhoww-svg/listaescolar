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
  lastUpdated: string | null;
};

export const LEGAL: Legal = {
  companyName: null,
  cnpj: null,
  dpoEmail: null,
  contactEmail: null,
  retention: null,
  claimRetention: null,
  auditRetention: null,
  legalBasis: null,
  operators: null,
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
    paragraphs: [["Hoje a plataforma não tem campo de estudante. Se passar a ter, será só apelido e série, informados pelo responsável para montar a lista escolar."]],
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
    title: "Base legal",
    paragraphs: [["Base legal do tratamento: ", { key: "legalBasis", label: "base legal" }, "."]],
  },
  {
    title: "Por quanto tempo",
    paragraphs: [["Prazo de retenção: ", { key: "retention", label: "prazo de retenção" }, "."]],
  },
  {
    title: "Seus direitos",
    paragraphs: [["Para pedir acesso, correção ou exclusão dos seus dados, fale com o encarregado: ", dpo, "."]],
  },
];
