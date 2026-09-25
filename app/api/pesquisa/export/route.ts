import { type NextRequest, NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env";
import { ExportTipoSchema } from "@/lib/pesquisa/schemas";
import { RESULTS_COOKIE_NAME, verifyResultsCookie } from "@/lib/pesquisa/auth-resultados";
import { exportLeadsRows, exportResponsesRows } from "@/lib/pesquisa/repositorio";
import { leadsToCsv, respostasToCsv } from "../_lib/csv";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tipoParsed = ExportTipoSchema.safeParse(searchParams.get("tipo"));
  if (!tipoParsed.success) {
    return NextResponse.json({ error: "invalid_tipo" }, { status: 400, headers: NO_STORE });
  }

  const password = getServerEnv().PESQUISA_RESULTS_PASSWORD;
  const cookieValue = readCookie(request.headers.get("cookie"), RESULTS_COOKIE_NAME);
  if (!password || !verifyResultsCookie(cookieValue, password)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const tipo = tipoParsed.data;
  const csv = tipo === "respostas" ? respostasToCsv(await exportResponsesRows()) : leadsToCsv(await exportLeadsRows());

  return new NextResponse(csv, {
    headers: {
      ...NO_STORE,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pesquisa-${tipo}.csv"`,
    },
  });
}
