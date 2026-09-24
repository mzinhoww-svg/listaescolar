import { Logo } from "@/components/brand/Logo";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 pb-24">
      <h1 className="sr-only">ListaCerta</h1>
      <Logo variant="horizontal" height={140} priority />
      <p className="text-texto-2 text-sm font-semibold tracking-[0.3em] uppercase">
        Pronta. Justa. Rápida.
      </p>
    </main>
  );
}
