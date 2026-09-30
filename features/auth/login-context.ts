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

const DESTINATIONS: readonly (readonly [string, string])[] = [
  ["/carrinho", "o seu carrinho"],
  ["/cotacao", "o pedido de cotação"],
  ["/enviar-lista", "o envio da lista"],
  ["/escolas", "a lista da escola"],
  ["/ir-para", "o seu carrinho"],
  ["/conta", "a sua conta"],
];

const pathOf = (next: string): string => next.split(/[?#]/, 1)[0] ?? "";

/** Nome do destino do login, para "voltamos para …". */
export function destinationLabel(next: string): string {
  const path = pathOf(next);
  return DESTINATIONS.find(([p]) => path === p || path.startsWith(`${p}/`))?.[1] ?? "a sua conta";
}

/** Aviso de `/entrar?sessao=terminou`: diz o que houve e para onde a pessoa volta. */
export function sessionEndedNotice(next: string): string {
  return `Sua sessão terminou. Entre de novo e voltamos para ${destinationLabel(next)}.`;
}

/** "Voltar" de `/entrar`: à lista/escola quando o destino é público; ao início nos demais (rota privada voltaria ao login). */
export function backFromLogin(next: string): { href: string; label: string } {
  const seg = pathOf(next).split("/").filter(Boolean);
  if (seg[0] === "escolas" && seg.length === 3 && seg[2] !== "reivindicar") return { href: next, label: "Voltar à lista" };
  if (seg[0] === "escolas" && seg.length === 2) return { href: next, label: "Voltar à escola" };
  return { href: "/", label: "Voltar ao início" };
}

const LOGIN_ERRORS: Record<string, string> = {
  codigo: "O link expirou ou já foi usado. Peça um novo link abaixo e abra o e-mail neste aparelho. Você volta ao mesmo lugar.",
  provedor: "Não conseguimos entrar com o Google agora. Use o link por e-mail abaixo ou tente de novo em alguns minutos.",
};

/** Texto de `/entrar?erro=`; código desconhecido vira mensagem genérica. */
export function loginErrorMessage(code: string): string {
  return LOGIN_ERRORS[code] ?? "Não foi possível entrar. Tente de novo.";
}
