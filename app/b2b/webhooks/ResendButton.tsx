"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { resendDeliveryAction } from "@/features/webhooks/actions";

export function ResendButton({ deliveryId }: { deliveryId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function resend() {
    setPending(true);
    const r = await resendDeliveryAction({ deliveryId });
    setPending(false);
    if (r.ok) router.refresh();
  }

  return (
    <button type="button" onClick={resend} disabled={pending} className="border-tinta rounded-botao h-11 border-[1.5px] px-3 text-[12px] font-extrabold disabled:opacity-50">
      {pending ? "Reenviando..." : "Reenviar"}
    </button>
  );
}
