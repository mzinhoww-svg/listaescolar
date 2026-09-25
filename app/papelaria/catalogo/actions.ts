"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionActor } from "@/features/stationeries/actor";
import { CatalogItemInputSchema, parsePriceToCents, parseStockAnswer } from "@/features/stationeries/catalog";
import { CSV_MAX_BYTES, parseCatalogCsv } from "@/features/stationeries/catalog-csv";
import { buildErrorReport } from "@/features/stationeries/error-report";
import { repositoryErrorCode, repositoryErrorMessage } from "@/features/stationeries/messages";
import { getStationeryOfOwner } from "@/features/stationeries/queries";
import { upsertCatalogItems } from "@/features/stationeries/repository";
import { createAdminClient } from "@/lib/supabase/admin";

export type ImportState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; imported: number; totalRows: number; errorCount: number; reportHref: string | null; reportName: string };

async function ownerOrRedirect() {
  const actor = await getSessionActor();
  if (!actor) redirect("/entrar?next=%2Fpapelaria%2Fcatalogo");
  if (actor.role !== "stationery_member" && actor.role !== "admin") redirect("/403");
  const own = await getStationeryOfOwner(actor.userId);
  if (!own) redirect("/papelaria");
  return { actor, stationery: own };
}

/** Novo item ou edição de preço/estoque (o nome é a chave). Origem sempre "informado pela papelaria". */
export async function saveItemAction(formData: FormData): Promise<void> {
  const { actor, stationery } = await ownerOrRedirect();
  const name = formData.get("name");
  const price = formData.get("price");
  const cents = typeof price === "string" ? parsePriceToCents(price) : null;
  const stock = parseStockAnswer(typeof formData.get("stock") === "string" ? String(formData.get("stock")) : "") ?? "unknown";
  const parsed = CatalogItemInputSchema.safeParse({ name: typeof name === "string" ? name : "", priceCents: cents, stock });
  if (!parsed.success) {
    const nameMsg = parsed.error.issues.find((i) => i.path[0] === "name")?.message ?? "";
    const code = cents === null ? "preco_invalido" : nameMsg.startsWith("O nome não pode começar") ? "nome_formula" : "item_invalido";
    redirect(`/papelaria/catalogo?erro=${code}`);
  }
  try {
    await upsertCatalogItems(createAdminClient(), actor, stationery.id, [parsed.data]);
  } catch (error) {
    console.error("salvar item", error);
    redirect(`/papelaria/catalogo?erro=${repositoryErrorCode(error)}`);
  }
  redirect("/papelaria/catalogo?ok=item");
}

/** Importa a planilha: linhas boas entram, linhas ruins voltam num relatório baixável (neutralizado). */
export async function importCatalogAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const { actor, stationery } = await ownerOrRedirect();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Escolha uma planilha CSV." };
  if (file.size > CSV_MAX_BYTES) return { status: "error", message: "A planilha passa de 2 MB." };
  const result = parseCatalogCsv(new Uint8Array(await file.arrayBuffer()));
  if (!result.ok) return { status: "error", message: result.message };
  if (result.items.length > 0) {
    try {
      await upsertCatalogItems(
        createAdminClient(),
        actor,
        stationery.id,
        result.items.map((i) => ({ name: i.name, priceCents: i.priceCents, stock: i.stock })),
      );
    } catch (error) {
      console.error("importar catálogo", error);
      return { status: "error", message: repositoryErrorMessage(error) };
    }
    revalidatePath("/papelaria/catalogo");
  }
  const report = result.errors.length > 0 ? buildErrorReport(result.errors) : null;
  return {
    status: "done",
    imported: result.items.length,
    totalRows: result.totalRows,
    errorCount: result.errors.length,
    reportHref: report?.href ?? null,
    reportName: report?.filename ?? "",
  };
}
