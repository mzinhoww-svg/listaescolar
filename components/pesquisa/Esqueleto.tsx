import { Cabecalho } from "./Cabecalho";
import styles from "./pesquisa.module.css";

/** Primeiro paint enquanto a sessão local é lida: evita tela em branco e salto de layout. */
export function Esqueleto() {
  return (
    <section aria-busy="true" aria-label="Carregando a pesquisa" className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-5 px-5 pt-3">
      <Cabecalho />
      <div className={`${styles.pulso} flex flex-col gap-4 pt-2`}>
        <div className="bg-campo h-7 w-11/12 rounded-lg" />
        <div className="bg-campo h-7 w-2/3 rounded-lg" />
        <div className="bg-campo mt-2 h-5 w-full rounded-lg" />
        <div className="bg-campo h-5 w-5/6 rounded-lg" />
        <div className="bg-campo rounded-card mt-4 h-20 w-full" />
      </div>
    </section>
  );
}
