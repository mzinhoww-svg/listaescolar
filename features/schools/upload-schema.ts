import { z } from "zod";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const CSV_TYPES = new Set(["", "text/csv", "application/csv", "application/vnd.ms-excel", "text/plain"]);

/** Valida o arquivo enviado (formulário e Server Action usam o mesmo schema). */
export const uploadFileSchema = z
  .object({ name: z.string(), size: z.number(), type: z.string() })
  .superRefine((f, ctx) => {
    if (f.size <= 0) ctx.addIssue({ code: "custom", message: "Selecione um arquivo CSV." });
    else if (f.size > MAX_UPLOAD_BYTES) ctx.addIssue({ code: "custom", message: "O arquivo excede 25 MB." });
    if (!f.name.toLowerCase().endsWith(".csv") || !CSV_TYPES.has(f.type)) {
      ctx.addIssue({ code: "custom", message: "Envie um arquivo no formato CSV." });
    }
  });

export type UploadTotals = {
  total: number;
  inserted: number;
  updated: number;
  unchanged: number;
  duplicate: number;
  rejected: number;
};

export type UploadState =
  | { status: "idle" }
  | { status: "error"; message: string; retryable: boolean }
  | { status: "file_error"; batchId: string; errors: { code: string; message: string; column?: string }[] }
  | {
      status: "success";
      batchId: string;
      alreadyExisted: boolean;
      isDemo: boolean;
      totals: UploadTotals;
      batchStatus: "pending" | "processing" | "completed" | "failed";
    };

export const IDLE: UploadState = { status: "idle" };
