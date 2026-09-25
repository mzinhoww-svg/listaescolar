import type { Metadata } from "next";
import { z } from "zod";

import { Screen } from "@/components/auth/Screen";
import { EmptyState } from "@/components/cart/CartStates";
import { requireUserOrLogin } from "@/features/cart/page-data";
import { getListReader, readServiceEnv } from "@/features/cart/service";

import { createCartAction } from "./actions";

export const metadata: Metadata = { title: "Montar carrinho · ListaCerta" };

export default async function NovoCarrinhoPage({ searchParams }: PageProps<"/carrinho/novo">) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.lista) ? sp.lista[0] : sp.lista;
  const listId = z.uuid().safeParse(raw);
  const next = listId.success ? `/carrinho/novo?lista=${listId.data}` : "/carrinho/novo";
  await requireUserOrLogin(next);

  if (!listId.success) {
    return (
      <EmptyState
        title="Nenhuma lista escolhida"
        text="Abra o carrinho a partir de uma lista de material para comparar as opções de compra."
      />
    );
  }
  const reader = getListReader(readServiceEnv());
  if (!reader) {
    return (
      <EmptyState
        title="Listas indisponíveis por aqui"
        text="Ainda não há fonte de listas ligada a este ambiente. Não inventamos dados."
      />
    );
  }
  const items = await reader.getItems(listId.data);
  if (!items || items.length === 0) {
    return (
      <EmptyState
        title="Lista não encontrada"
        text="Não achamos itens para esta lista, ou ela não está disponível para você."
      />
    );
  }
  return (
    <Screen>
      <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em]">
        Montar carrinho com {items.length} {items.length === 1 ? "item" : "itens"}
      </h1>
      <p className="text-texto-2 text-xs font-semibold">
        Lista de demonstração: itens de exemplo, sem dado de escola nem de aluno.
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
        <button
          type="submit"
          className="bg-tinta text-papel rounded-botao flex h-14 w-full items-center justify-center text-base font-extrabold"
        >
          Comparar opções
        </button>
      </form>
    </Screen>
  );
}
