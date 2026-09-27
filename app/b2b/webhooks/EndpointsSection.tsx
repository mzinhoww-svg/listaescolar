"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { EndpointRow } from "@/features/webhooks/repository";

import { EndpointForm } from "./EndpointForm";

const MAX_ENDPOINTS = 3;

export function EndpointsSection({ endpoints }: { endpoints: readonly EndpointRow[] }) {
  const router = useRouter();
  const [showNew, setShowNew] = useState(endpoints.length === 0);

  function onSaved() {
    setShowNew(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-extrabold">Endpoints</h2>
        {endpoints.length < MAX_ENDPOINTS && !showNew ? (
          <button type="button" onClick={() => setShowNew(true)} className="bg-tinta text-papel rounded-botao flex h-11 items-center px-5 text-[14px] font-extrabold">
            + Novo endpoint
          </button>
        ) : null}
      </div>
      {endpoints.map((e) => (
        <EndpointForm key={e.id} endpoint={e} onSaved={onSaved} />
      ))}
      {showNew ? <EndpointForm endpoint={null} onSaved={onSaved} /> : null}
      {endpoints.length === 0 && !showNew ? <p className="text-texto-2 rounded-[20px] bg-white p-6 text-[15px] font-bold">Nenhum endpoint ainda.</p> : null}
    </div>
  );
}
