/** Estado do formulário de aluno (App13/S15). Sucesso nunca aparece aqui: a action redireciona para o hub. */
export type StudentActionResult = { status: "idle" } | { status: "error"; message: string };
export const studentIdleState: StudentActionResult = { status: "idle" };
