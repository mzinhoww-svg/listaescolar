// Os contratos novos (ListReader, LeadListContextReader, PublicationContextReader, SchoolLabelReader) contra as implementações
// REAIS, por HTTP (supabase-js com a chave de serviço) e dados confirmados no banco local (S11 · Task 2).
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const currentUser = vi.fn();
const currentRole = vi.fn();
vi.mock("@/features/auth/queries", () => ({ getCurrentUser: () => currentUser(), getCurrentRole: () => currentRole() }));

import { getSessionActor } from "@/features/auth/actor";
import { createRealPublicationContextReader } from "@/features/integration/publication-context";
import { createRealListPublisher } from "@/features/integration/list-publisher";
import { SupabaseLeadListContextReader } from "@/features/integration/lead-context";
import { SupabaseListReader } from "@/features/integration/list-reader";
import { SupabaseSchoolLabelReader } from "@/features/integration/school-labels";
import { localApi } from "../helpers/local-api";
import { runLeadContextContract } from "../integration/lead-context.contract";
import { runListReaderContract } from "../integration/list-reader.contract";
import { runPublicationContextContract } from "../integration/publication-context.contract";
import { runSchoolLabelsContract } from "../integration/school-labels.contract";
import { cleanupUsers, ensureSchool, IDS, seedUsers, withSuperuser } from "./helpers";
import { purgeSchools } from "./integration-fixtures";
import { purgeSubmissions, seedSubmission } from "./review-fixtures";

const { url, key } = localApi();
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const world = {} as {
  school: string;
  school2: string;
  school2Inep: string;
  versionId: string;
  copyWithSchool: string;
  copyNoSchool: string;
  parentActor: Awaited<ReturnType<typeof getSessionActor>>;
  memberActor: Awaited<ReturnType<typeof getSessionActor>>;
  municipalityId: string;
  submissions: string[];
};

async function actorOf(id: string, role: string) {
  currentUser.mockResolvedValue({ id });
  currentRole.mockResolvedValue(role);
  return getSessionActor();
}

beforeAll(async () => {
  await seedUsers();
  world.parentActor = await actorOf(IDS.parent, "parent");
  world.memberActor = await actorOf(IDS.school_member, "school_member");
  world.school = randomUUID();
  world.school2 = randomUUID();
  world.submissions = [];
  await withSuperuser(async (c) => {
    await ensureSchool(c, world.school);
    await ensureSchool(c, world.school2);
    await c.query("update public.schools set name = 'Escola Contrato', verification_status = 'verified' where id = $1", [world.school]);
    await c.query("update public.schools set name = 'Escola Contrato Dois', verification_status = 'claimed' where id = $1", [world.school2]);
    world.school2Inep = (await c.query("select inep from public.schools where id = $1", [world.school2])).rows[0].inep;
    world.municipalityId = (await c.query("select municipality_id from public.schools where id = $1", [world.school])).rows[0].municipality_id;
    await c.query("insert into public.school_members (school_id, profile_id, member_role) values ($1, $2, 'co_admin')", [world.school2, IDS.school_member]);
    const withSchool = await seedSubmission(c, { status: "human_review", source: "parent", owner: "parent", schoolId: world.school, grade: "5º ano", year: 2027 });
    const noSchool = await seedSubmission(c, { status: "human_review", source: "parent", owner: "parent", schoolId: null });
    world.submissions.push(withSchool, noSchool);
    const open = async (s: string) => (await sb.rpc("parent_copy_open", { p_submission_id: s, p_owner_id: IDS.parent })).data as { copyId: string };
    world.copyWithSchool = (await open(withSchool)).copyId;
    world.copyNoSchool = (await open(noSchool)).copyId;
  });
  const published = await createRealListPublisher(sb).publish({
    idempotencyKey: `k-${randomUUID()}`,
    submissionId: randomUUID(),
    schoolId: world.school,
    gradeSlug: "ef-4",
    schoolYear: 2027,
    source: "school_upload",
    actor: { kind: "system" },
    items: [
      { position: 1, originalName: "Caderno 96 folhas", normalizedName: "caderno 96 folhas", category: "papelaria", quantity: 2, unit: "un", confidence: 0.9 },
      { position: 2, originalName: "Lápis preto", normalizedName: "lapis preto", category: "escrita", quantity: 12, unit: null, confidence: null, origin: "reviewed" },
    ],
  });
  world.versionId = published.newVersionId;
});

afterAll(async () => {
  await purgeSubmissions(world.submissions);
  await withSuperuser((c) => c.query("delete from public.consents where purpose = 'list_upload' and profile_id = $1 and id not in (select consent_id from public.list_submissions)", [IDS.parent]));
  await purgeSchools([world.school, world.school2]);
  await cleanupUsers();
});

runListReaderContract("real (list_reader_get)", () => ({
  reader: new SupabaseListReader(sb),
  known: { listId: world.versionId, kind: "official", isDemo: false, itemNames: ["Caderno 96 folhas", "Lápis preto"], options: { actor: null } },
  foreign: { listId: world.copyWithSchool, ownerOptions: { actor: world.parentActor }, otherOptions: { actor: world.memberActor } },
}));

runLeadContextContract("real (lead_list_context)", () => ({
  reader: new SupabaseLeadListContextReader(sb),
  known: { listId: world.versionId, expected: { schoolName: "Escola Contrato", gradeLabel: "4º ano", schoolYear: 2027, isDemo: false, municipalityId: world.municipalityId } },
  foreign: { listId: world.copyWithSchool, otherActorId: IDS.school_member },
  noSchoolCopy: { listId: world.copyNoSchool, ownerId: IDS.parent },
}));

runPublicationContextContract("real (publication_context)", () => ({
  reader: createRealPublicationContextReader(sb, { now: () => new Date("2026-09-25T12:00:00Z") }),
  school: { id: world.school2, verification: "claimed", municipalityEnabled: true },
  gradeLabel: "4º ano",
  gradeSlug: "ef-4",
  schoolYear: 2027,
  linkedProfile: IDS.school_member,
  unlinkedProfile: IDS.parent,
  unknownSchoolId: randomUUID(),
}));

runSchoolLabelsContract("real (school_labels)", () => ({
  reader: new SupabaseSchoolLabelReader(sb),
  known: { id: world.school2, name: "Escola Contrato Dois", inep: world.school2Inep },
  unknownId: randomUUID(),
}));

describe("real: casos que só o banco prova", () => {
  it("a cópia do pai dono tem contexto de lead com escola, série e ano do envio (nada inventado)", async () => {
    const c = await new SupabaseLeadListContextReader(sb).getContext(world.copyWithSchool, { actorId: IDS.parent });
    expect(c).toMatchObject({ schoolName: "Escola Contrato", gradeLabel: "5º ano", schoolYear: 2027, isDemo: false, municipalityId: world.municipalityId });
  });
  it("a cópia do dono chega ao carrinho como parent_copy; a lista oficial chega como official (mesmo leitor)", async () => {
    const reader = new SupabaseListReader(sb);
    expect(await reader.getList(world.copyWithSchool, { actor: world.parentActor })).toMatchObject({ kind: "parent_copy", isDemo: false });
    expect(await reader.getList(world.versionId, { actor: world.parentActor })).toMatchObject({ kind: "official", isDemo: false });
  });
  it("o leitor de contexto de publicação enxerga a lista atual depois de publicada", async () => {
    const r = await createRealPublicationContextReader(sb).load({ schoolId: world.school, grade: "4º ano", schoolYear: 2027, submittedBy: IDS.parent });
    expect(r.currentList).toMatchObject({ status: "published", currentVersionId: world.versionId });
    expect(r.school).toEqual({ verification: "verified", municipalityEnabled: true });
  });
});
