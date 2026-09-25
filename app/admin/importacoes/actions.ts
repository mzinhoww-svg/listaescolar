"use server";

import { revalidatePath } from "next/cache";

import { getCurrentRole, getCurrentUser } from "@/features/auth/queries";
import { importInepFile } from "@/features/schools/import-service";
import { createSupabaseSchoolsRepository } from "@/features/schools/supabase-gateway";
import { uploadFileSchema, type UploadState } from "@/features/schools/upload-schema";

export async function uploadInepCsv(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Sessão expirada. Entre novamente.", retryable: false };
  if ((await getCurrentRole()) !== "admin") {
    return { status: "error", message: "Você não tem permissão para importar escolas.", retryable: false };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return { status: "error", message: "Selecione um arquivo CSV.", retryable: false };
  const parsed = uploadFileSchema.safeParse({ name: file.name, size: file.size, type: file.type });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Arquivo inválido.", retryable: false };
  }
  const isDemo = formData.get("isDemo") === "on";

  try {
    const result = await importInepFile(
      { fileName: file.name, buffer: Buffer.from(await file.arrayBuffer()), importedBy: user.id, isDemo },
      { repo: createSupabaseSchoolsRepository() },
    );
    revalidatePath("/admin/importacoes");
    if (result.fileErrors.length > 0 && result.totals.total === 0 && result.status === "failed") {
      const onlyProcessing = result.fileErrors.every((e) => e.code === "processing_failed");
      if (onlyProcessing) {
        return { status: "error", message: result.fileErrors[0]?.message ?? "Falha ao processar.", retryable: true };
      }
      return { status: "file_error", batchId: result.batchId, errors: result.fileErrors };
    }
    return {
      status: "success",
      batchId: result.batchId,
      alreadyExisted: result.alreadyExisted,
      isDemo,
      batchStatus: result.status,
      totals: result.totals,
    };
  } catch {
    return { status: "error", message: "Não foi possível importar o arquivo. Tente novamente.", retryable: true };
  }
}
