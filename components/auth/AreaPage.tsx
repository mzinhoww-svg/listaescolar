import { signOutAction } from "./sign-out-action";

type Props = { title: string; email: string | undefined; role: string };

export function AreaPage({ title, email, role }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-1 flex-col gap-4 px-6 py-14">
      <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em]">{title}</h1>
      <dl className="text-texto-2 flex flex-col gap-1 text-[15px]">
        <div className="flex gap-2">
          <dt className="font-extrabold">E-mail</dt>
          <dd>{email ?? "indisponível"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-extrabold">Papel</dt>
          <dd>{role}</dd>
        </div>
      </dl>
      <form action={signOutAction}>
        <button
          type="submit"
          className="border-tinta text-tinta flex h-[52px] w-full items-center justify-center rounded-botao border-[1.5px] text-base font-extrabold"
        >
          Sair
        </button>
      </form>
    </main>
  );
}
