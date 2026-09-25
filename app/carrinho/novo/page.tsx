import type { Metadata } from "next";
import { z } from "zod";

import { Screen } from "@/components/auth/Screen";
import { EmptyState } from "@/components/cart/CartStates";
import { SubmitButton } from "@/components/cart/SubmitButton";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { getListReader, readServiceEnv } from "@/features/cart/service";

import { createCartAction } from "./actions";

export const metadata: Metadata = { title: "Montar carrinho · ListaCerta" };

export default async function NovoCarrinhoPage({ searchParams }: PageProps<"/carrinho/novo">) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.lista) ? sp.lista[0] : sp.lista;
  const listId = z.uuid().safeParse(raw);
  const next = listId.success ? `/carrinho/novo?lista=${listId.data}` : "/carrinho/novo";
  await requireAccess(next);
  const listError = (Array.isArray(sp.erro) ? sp.erro[0] : sp.erro) === "lista";

  if (!listId.success) {
    return (
      <EmptyState
        title={listError ? "Não foi possível montar o carrinho" : "Nenhuma lista escolhida"}
        text={
          listError
            ? "Não conseguimos ler os itens desta lista. Volte e tente de novo."
            : "Abra o carrinho a partir de uma lista de material para comparar as opções de compra."
        }
      />
    );
  }
  const list = await getListReader(readServiceEnv()).getList(listId.data, { actor: await getSessionActor() });
  if (!list || list.items.length === 0) {
    return (
      <EmptyState
        title="Lista não encontrada"
        text="Não achamos itens para esta lista, ou ela não está disponível para você."
      />
    );
  }
  const items = list.items;
  return (
    <Screen>
      <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em]">
        Montar carrinho com {items.length} {items.length === 1 ? "item" : "itens"}
      </h1>
      {listError ? (
        <p role="alert" className="bg-campo rounded-campo px-3.5 py-3 text-[13px] font-bold">
          Não conseguimos ler os itens desta lista. Tente de novo.
        </p>
      ) : null}
      <p className="text-texto-2 text-xs font-semibold">
        {list.isDemo
          ? "Lista de demonstração: itens de exemplo, sem dado de escola nem de aluno."
          : list.kind === "parent_copy"
            ? "Sua cópia privada da lista: só você a vê."
            : "Lista oficial publicada."}
      </p>
      <ul className="bg-branco-tonal divide-linha divide-y rounded-[24px] px-4 py-2">
        {items.map((i) => (
          <li key={i.id} className="flex justify-between gap-3 py-2.5 text-sm font-semibold">
            <span>{i.name}</span>
            <span className="text-texto-3">× {i.quantity}</span>
          </li>
        ))}
      </ul>
      <div className="flex-1" />
      <form action={createCartAction}>
        <input type="hidden" name="listId" value={listId.data} />
        <SubmitButton
          pendingLabel="Montando..."
          className="bg-tinta text-papel rounded-botao flex h-14 w-full items-center justify-center text-base font-extrabold"
        >
          Comparar opções
        </SubmitButton>
      </form>
    </Screen>
  );
}
