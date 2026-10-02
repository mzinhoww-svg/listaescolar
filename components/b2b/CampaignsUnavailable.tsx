/** Campanhas B2B pagas ficam desligadas por padrão (B2B_CAMPAIGNS_ENABLED); a tela explica sem prometer data nem preço. */
export function CampaignsUnavailable() {
  return (
    <div role="status" className="flex flex-col gap-3">
      <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.035em]">Campanhas</h1>
      <p className="text-texto-2 max-w-2xl rounded-[20px] bg-white p-6 text-[15px] font-bold">Campanhas estão indisponíveis no momento.</p>
    </div>
  );
}
