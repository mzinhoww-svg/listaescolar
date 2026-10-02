export type LoginIntroCopy = { title: string; lead: string };

const DEFAULT: LoginIntroCopy = {
  title: "Entre para acompanhar a lista de cada aluno",
  lead: "Um acesso só para todos os alunos da família. Sem senha para lembrar.",
};

const BY_PREFIX: readonly (readonly [string, LoginIntroCopy])[] = [
  ["/carrinho", { title: "Entre para montar o carrinho desta lista", lead: "A sua lista continua aqui quando você voltar. Sem senha: enviamos um link por e-mail." }],
  ["/cotacao", { title: "Entre para pedir cotação à papelaria", lead: "Assim você acompanha a resposta da papelaria. Sem senha: enviamos um link por e-mail." }],
  ["/enviar-lista", { title: "Entre para enviar a lista da escola", lead: "Precisamos saber quem enviou para avisar você quando a lista for revisada. Sem senha." }],
  ["/escolas", { title: "Entre para salvar esta lista", lead: "Guardamos a lista para o seu aluno e você volta a ela quando quiser. Sem senha." }],
];

/** Título e apoio da tela de entrada conforme o destino (`next`) que a pessoa queria abrir. */
export function loginIntroFor(next: string): LoginIntroCopy {
  const path = next.split(/[?#]/, 1)[0] ?? "";
  const hit = BY_PREFIX.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  return hit ? hit[1] : DEFAULT;
}
