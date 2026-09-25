"use server";

import { redirect } from "next/navigation";

import { getCurrentRole, getCurrentUser } from "@/features/auth/queries";
import { CatalogItemInputSchema, parsePriceToCents, parseStockAnswer } from "@/features/stationeries/catalog";
import { CSV_MAX_BYTES, parseCatalogCsv } from "@/features/stationeries/catalog-csv";
import { buildErrorReport } from "@/features/stationeries/error-report";
import { repositoryErrorMessage } from "@/features/stationeries/messages";
import { getStationeryOfOwner } from "@/features/stationeries/queries";
import { upsertCatalogItems } from "@/features/stationeries/repository";
import { createAdminClient } from "@/lib/supabase/admin";

export type ImportState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; imported: number; totalRows: number; errorCount: number; reportHref: string | null; reportName: string };

async function ownerOrRedirect() {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar?next=%2Fpapelaria%2Fcatalogo");
  const role = await getCurrentRole();
  if (role !== "stationery_member" && role !== "admin") redirect("/403");
  const own = await getStationeryOfOwner(user.id);
  if (!own) redirect("/papelaria");
  return { userId: user.id, stationery: own };
}

/** Novo item ou edição de preço/estoque (o nome é a chave). Origem sempre "informado pela papelaria". */
export async function saveItemAction(formData: FormData): Promise<void> {
  const { userId, stationery } = await ownerOrRedirect();
  const name = formData.get("name");
  const price = formData.get("price");
  const cents = typeof price === "string" ? parsePriceToCents(price) : null;
  const stock = parseStockAnswer(typeof formData.get("stock") === "string" ? String(formData.get("stock")) : "") ?? "unknown";
  const parsed = CatalogItemInputSchema.safeParse({ name: typeof name === "string" ? name : "", priceCents: cents, stock });
  if (!parsed.success) {
    const msg = cents === null ? "Preço inválido. Use o formato 12,90." : (parsed.error.issues[0]?.message ?? "Item inválido.");
    redirect(`/papelaria/catalogo?erro=${encodeURIComponent(msg)}`);
  }
  try {
    await upsertCatalogItems(createAdminClient(), stationery.id, userId, [parsed.data]);
  } catch (error) {
    console.error("salvar item", error);
    redirect(`/papelaria/catalogo?erro=${encodeURIComponent(repositoryErrorMessage(error))}`);
  }
  redirect("/papelaria/catalogo?ok=item");
}

/** Importa a planilha: linhas boas entram, linhas ruins voltam num relatório baixável (neutralizado). */
export async function importCatalogAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const { userId, stationery } = await ownerOrRedirect();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Escolha uma planilha CSV." };
  if (file.size > CSV_MAX_BYTES) return { status: "error", message: "A planilha passa de 2 MB." };
  const result = parseCatalogCsv(new Uint8Array(await file.arrayBuffer()));
  if (!result.ok) return { status: "error", message: result.message };
  if (result.items.length > 0) {
    try {
      await upsertCatalogItems(
        createAdminClient(),
        stationery.id,
        userId,
        result.items.map((i) => ({ name: i.name, priceCents: i.priceCents, stock: i.stock })),
      );
    } catch (error) {
      console.error("importar catálogo", error);
      return { status: "error", message: repositoryErrorMessage(error) };
    }
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
