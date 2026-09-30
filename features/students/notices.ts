/** Avisos de `/conta?aviso=` depois de uma ação sobre aluno (UX-053). Só códigos conhecidos viram texto. */
const NOTICES: Record<string, string> = {
  "aluno-salvo": "Aluno salvo. Agora busque a lista da escola dele e toque em Salvar lista.",
  "aluno-atualizado": "Aluno atualizado.",
  "aluno-excluido": "Aluno excluído, junto com as listas salvas para ele.",
};

export function accountNotice(code: string | string[] | undefined): string | null {
  const c = Array.isArray(code) ? code[0] : code;
  return c !== undefined && Object.hasOwn(NOTICES, c) ? (NOTICES[c] ?? null) : null;
}
