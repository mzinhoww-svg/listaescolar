// Termos da API B2B (B2B00/`/parceiros/termos`). Versão gravada em `consents.text_version` (purpose
// `b2b_api_terms`) no cadastro; mudar o texto de forma relevante exige nova versão (nunca editar em silêncio).
export const B2B_TERMS_TEXT_VERSION = "b2b-api-terms-v1";

/** Texto com placeholders jurídicos; sem afirmar conformidade (padrão S27). Preenchido no cadastro com os dados do
 * próprio parceiro (razão social, CNPJ) e o contato informado. */
export const B2B_TERMS_TEXT = `
Termos de uso da API B2B do ListaCerta

Estes termos regem o acesso de [Razão social], CNPJ [CNPJ], contato [contato], à API B2B do ListaCerta
("API").

1. Dados expostos. A API devolve apenas dados públicos de listas oficiais de material escolar já publicadas
   (escola, lista, itens) e agregados de uso da própria chave. A API nunca devolve dado de família, de aluno,
   contato de escola, identificador de perfil, campo interno de processamento ou dado de outro parceiro.

2. Proibições de uso. É proibido: tentar identificar famílias ou alunos a partir dos dados da API; redistribuir
   a chave de API; usar a API para fins diferentes dos combinados no cadastro; contornar o limite de requisições.

3. Revogação. O ListaCerta pode revogar chaves ou suspender o acesso a qualquer momento, com ou sem aviso prévio,
   em caso de uso indevido, suspeita de vazamento da chave ou decisão administrativa.

4. Limites. Cada chave está sujeita a um limite de requisições por minuto e por dia, definido conforme o plano do
   parceiro. Exceder o limite resulta em respostas 429 até a janela seguinte.

5. Sem garantias. O ListaCerta não garante disponibilidade contínua da API nem exatidão de dados fora do que foi
   informado pelas escolas. O cadastro no INEP não constitui verificação. Este documento não constitui parecer
   jurídico nem declaração de conformidade regulatória.

6. Vigência. Estes termos valem enquanto o parceiro mantiver acesso ativo à API e podem ser atualizados; o uso
   continuado após atualização implica aceite da nova versão.
`.trim();
