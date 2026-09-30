"use client";

import { AsyncOptions } from "@/components/submissions/AsyncOptions";
import { ProcessingScreen } from "@/components/submissions/ProcessingScreen";
import { ReviewSummary } from "@/components/submissions/ReviewSummary";
import { StatusNotice } from "@/components/submissions/StatusNotice";
import { useSubmissionStatus } from "@/components/submissions/useSubmissionStatus";
import type { StatusPayload } from "@/features/submissions/status-model";

/** Painel do envio (família): a consulta e a parada em estado final vivem em `useSubmissionStatus`. */
export function StatusPanel({ submissionId, initial }: { submissionId: string; initial: StatusPayload }) {
  const { data, phase, lost } = useSubmissionStatus(submissionId, initial);

  if (phase === "ready") return <ReviewSummary result={data.result} isDemo={data.isDemo} status={data.status} publicationDemo={data.publicationDemo === true} submissionId={submissionId} source={data.source} publishedBy={data.publishedBy} {...(data.listHref ? { listHref: data.listHref } : {})} />;
  if (phase === "failed") return <StatusNotice kind="failed" />;
  if (phase === "unavailable") return <StatusNotice kind="unavailable" />;
  if (lost) return <StatusNotice kind="lost" />;
  return (
    <ProcessingScreen phase="reading">
      {data.status === "processing_async" ? <AsyncOptions submissionId={submissionId} /> : null}
    </ProcessingScreen>
  );
}
