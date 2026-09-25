import { notFound } from "next/navigation";
import { z } from "zod";

import { SchoolShell } from "@/components/submissions/SchoolShell";
import { requireAccess } from "@/features/auth/guard";

import { SchoolUploadForm } from "./SchoolUploadForm";

export const metadata = { title: "Enviar PDF da lista · ListaCerta" };
export const maxDuration = 30;

export default async function Page({ searchParams }: { searchParams: Promise<{ escola?: string | string[] }> }) {
  const { user } = await requireAccess("/escola/listas/nova"); // school_member ou admin
  const { escola } = await searchParams;
  const schoolId = z.uuid().safeParse(escola);
  if (!schoolId.success) notFound();
  const now = new Date();
  const y = now.getFullYear();
  return (
    <SchoolShell email={user.email}>
      <SchoolUploadForm schoolId={schoolId.data} years={[y, y + 1]} defaultYear={now.getMonth() >= 7 ? y + 1 : y} />
    </SchoolShell>
  );
}
