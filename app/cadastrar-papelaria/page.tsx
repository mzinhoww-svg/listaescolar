import type { Metadata } from "next";
import Link from "next/link";

import { Notice } from "@/components/stationeries/PanelShell";
import { RegistrationForm } from "@/components/stationeries/RegistrationForm";
import { StatusPanel } from "@/components/stationeries/StatusPanel";
import { ROLE_BLOCK_MESSAGE } from "@/features/stationeries/messages";
import { listEnabledMunicipalities, listStatusEvents } from "@/features/stationeries/queries";
import { requireSession } from "@/features/stationeries/session";
import { getStationeryOfOwner } from "@/features/stationeries/queries";

import { registerStationeryAction, resubmitAction } from "./actions";

export const metadata: Metadata = { title: "Cadastre sua papelaria", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const { userId, role } = await requireSession("/cadastrar-papelaria");
  const wrap = (children: React.ReactNode) => (
    <main className="mx-auto w-full max-w-[1000px] flex-1 px-5 py-10 md:px-8">
      <p className="text-texto-3 text-[13px] font-semibold">Papelaria / Cadastro</p>
      <h1 className="mb-6 text-[36px] leading-[1.05] font-extrabold tracking-[-0.035em]">Cadastre sua papelaria</h1>
      {children}
    </main>
  );

  if (role === "stationery_member") {
    return wrap(
      <Notice kind="info">
        Você já tem uma papelaria aprovada.{" "}
        <Link href="/papelaria" className="underline">
          Abrir o painel
        </Link>
        .
      </Notice>,
    );
  }
  if (role !== "parent") {
    return wrap(<Notice kind="error">{ROLE_BLOCK_MESSAGE}</Notice>);
  }

  const own = await getStationeryOfOwner(userId);
  if (own) {
    const events = await listStatusEvents(own.id);
    return wrap(<StatusPanel stationery={own} events={events} resubmit={resubmitAction} submitError={erro === "envio"} />);
  }
  const municipalities = await listEnabledMunicipalities();
  if (municipalities.length === 0) {
    return wrap(<Notice kind="info">Ainda não há município habilitado para cadastro de papelarias.</Notice>);
  }
  return wrap(<RegistrationForm action={registerStationeryAction} municipalities={municipalities} />);
}
