import { Screen } from "@/components/auth/Screen";

/** App11: estado "Entrando". */
export default function Loading() {
  return (
    <Screen>
      <div className="flex flex-1 flex-col">
        <div className="flex-1" />
        <div className="flex flex-col items-center gap-4 text-center" role="status">
          <div className="border-campo border-t-verde-certo flex size-[132px] animate-spin items-center justify-center rounded-full border-[6px]" />
          <p className="text-[22px] leading-[1.4] font-extrabold">Entrando</p>
          <p className="text-texto-3 text-sm font-medium">Isso leva alguns segundos.</p>
        </div>
        <div className="flex-1" />
      </div>
    </Screen>
  );
}
