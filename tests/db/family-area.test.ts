// Área da família (S15): estudantes (só apelido e série) e listas salvas. Sem trilha; roda depois da S11 (FKs reais
// para schools/grades/profiles/school_lists). Nenhuma leitura de admin/system em students (mínimo de dado de menor).
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asServiceCommitted, attempt, attemptH, cleanupUsers, ensureSchool, IDS, inTx, seedUsers, withClaims, withSuperuser } from "./helpers";
import { seedInState } from "./list-fixtures";

// Escola única e FIXA para todo o arquivo: `seedInState`/`ensureSchool` gravam de verdade (fora de transação
// revertida), então uma escola por teste vazaria dezenas de linhas para os testes seguintes (ex.: imports.test.ts
// conta `select count(*) from public.schools` esperando banco limpo). Reaproveitar uma só e limpar tudo no afterAll.
const SCHOOL_ID = "00000000-0000-4000-8000-0000000f0001";

beforeAll(async () => {
  await seedUsers();
  await withSuperuser((c) => ensureSchool(c, SCHOOL_ID));
});
afterAll(async () => {
  await withSuperuser(async (c) => {
    await c.query("begin");
    await c.query("set local session_replication_role = replica");
    await c.query("delete from public.saved_lists where owner_id = any($1::uuid[])", [[IDS.parent, IDS.school_member, IDS.admin]]);
    await c.query("delete from public.students where school_id = $1", [SCHOOL_ID]);
    await c.query(
      "delete from public.list_status_events where list_id in (select id from public.school_lists where school_id = $1)",
      [SCHOOL_ID],
    );
    await c.query(
      "delete from public.list_items where version_id in (select id from public.list_versions where list_id in (select id from public.school_lists where school_id = $1))",
      [SCHOOL_ID],
    );
    await c.query(
      "delete from public.list_versions where list_id in (select id from public.school_lists where school_id = $1)",
      [SCHOOL_ID],
    );
    await c.query("delete from public.school_lists where school_id = $1", [SCHOOL_ID]);
    await c.query("delete from public.schools where id = $1", [SCHOOL_ID]);
    await c.query("commit");
  });
  await cleanupUsers();
});

async function gradeId(c: Client, slug = "ef-1"): Promise<string> {
  return (await c.query("select id from public.grades where slug = $1", [slug])).rows[0].id as string;
}

describe("student_nickname_valid", () => {
  const valid = async (c: Client, p: string | null) => (await c.query("select public.student_nickname_valid($1) as v", [p])).rows[0].v as boolean;
  it("aceita apelido único, sem sobrenome nem dígito; recusa o resto", async () => {
    await inTx(async (c) => {
      for (const ok of ["Maria", "Ana-Clara", "Zé", "Bento"]) expect(await valid(c, ok), ok).toBe(true);
      for (const bad of [null, "", "a", "Nome Sobrenome", "Maria123", "x".repeat(31), " Maria", "Maria ", "\u0007Maria"]) {
        expect(await valid(c, bad), JSON.stringify(bad)).toBe(false);
      }
    });
  });
});

describe("tabelas: colunas e RLS", () => {
  it("students e saved_lists têm id/created_at/updated_at e RLS habilitada", async () => {
    await withSuperuser(async (c) => {
      for (const t of ["students", "saved_lists"]) {
        const cols = await c.query("select column_name from information_schema.columns where table_schema='public' and table_name=$1", [t]);
        expect(cols.rows.map((r) => r.column_name), t).toEqual(expect.arrayContaining(["id", "created_at", "updated_at"]));
        const rls = await c.query("select relrowsecurity from pg_class where oid = $1::regclass", [`public.${t}`]);
        expect(rls.rows[0]?.relrowsecurity, t).toBe(true);
      }
    });
  });

  it("FKs de students/saved_lists são reais (schools, grades, profiles, school_lists) — pós-S11", async () => {
    await withSuperuser(async (c) => {
      const r = await c.query(
        `select conrelid::regclass::text as t, confrelid::regclass::text as f from pg_constraint
         where contype = 'f' and conrelid = any(array['public.students','public.saved_lists']::regclass[])`,
      );
      const targets = r.rows.map((x) => String(x.f).replace(/^public\./, ""));
      expect(targets.sort()).toEqual(["grades", "profiles", "profiles", "school_lists", "schools", "students"].sort());
    });
  });
});

describe("students: CRUD do dono", () => {
  it("o dono cria, edita e apaga o próprio aluno; escola/série inválida é recusada", async () => {
    const school = SCHOOL_ID;
    await withClaims("parent", async (c) => {
      const grade = await gradeId(c);
      const created = await attemptH(
        c,
        "insert into public.students (owner_id, nickname, school_id, grade_id, school_year) values ($1, 'Maria', $2, $3, 2027) returning id",
        [IDS.parent, school, grade],
      );
      expect(created.error).toBeNull();
      const id = created.rows[0]!.id as string;
      expect((await attempt(c, "update public.students set nickname = 'Mariazinha' where id = $1", [id])).error).toBeNull();
      const row = (await c.query("select nickname from public.students where id = $1", [id])).rows[0];
      expect(row.nickname).toBe("Mariazinha");
      expect((await attempt(c, "delete from public.students where id = $1", [id])).rowCount).toBe(1);

      const badSchool = await attemptH(
        c,
        "insert into public.students (owner_id, nickname, school_id, grade_id, school_year) values ($1, 'Joao', gen_random_uuid(), $2, 2027)",
        [IDS.parent, grade],
      );
      expect(badSchool.error).not.toBeNull();
      const badYear = await attemptH(
        c,
        "insert into public.students (owner_id, nickname, school_id, grade_id, school_year) values ($1, 'Joao', $2, $3, 1999)",
        [IDS.parent, school, grade],
      );
      expect(badYear.error).not.toBeNull();
    });
  });

  it("apelido com espaço (sobrenome) e com dígito são recusados pelo CHECK", async () => {
    const school = SCHOOL_ID;
    await withClaims("parent", async (c) => {
      const grade = await gradeId(c);
      for (const nickname of ["Maria Silva", "Aluno123", "a", "x".repeat(31)]) {
        const r = await attemptH(
          c,
          "insert into public.students (owner_id, nickname, school_id, grade_id, school_year) values ($1, $2, $3, $4, 2027)",
          [IDS.parent, nickname, school, grade],
        );
        expect(r.error, nickname).not.toBeNull();
        expect(r.code, nickname).toBe("23514");
      }
    });
  });

  it("não vê nem edita aluno de outro perfil; update não muda id nem owner_id", async () => {
    const school = SCHOOL_ID;
    const grade = await withSuperuser((c) => gradeId(c));
    // withClaims sempre faz rollback: o aluno-fixture precisa ser COMMITADO para existir nas transações seguintes.
    const otherId = await asServiceCommitted(async (c) =>
      (
        await c.query(
          "insert into public.students (owner_id, nickname, school_id, grade_id, school_year) values ($1, 'Pedro', $2, $3, 2027) returning id",
          [IDS.school_member, school, grade],
        )
      ).rows[0]!.id as string,
    );
    try {
      await withClaims("parent", async (c) => {
        expect((await c.query("select id from public.students where id = $1", [otherId])).rowCount).toBe(0);
        expect((await attempt(c, "update public.students set nickname = 'Hackeado' where id = $1", [otherId])).rowCount).toBe(0);
      });
      await withClaims("school_member", async (c) => {
        expect((await attempt(c, "update public.students set owner_id = $2 where id = $1", [otherId, IDS.parent])).code).toBe("42501");
        const still = (await c.query("select nickname from public.students where id = $1", [otherId])).rows[0];
        expect(still.nickname).toBe("Pedro");
      });
    } finally {
      await withSuperuser((c) => c.query("delete from public.students where id = $1", [otherId]));
    }
  });

  it("admin e anon não enxergam nenhum aluno (mínimo de dado de menor: sem policy de suporte)", async () => {
    const school = SCHOOL_ID;
    const grade = await withSuperuser((c) => gradeId(c));
    const id = await asServiceCommitted(async (c) =>
      (
        await c.query(
          "insert into public.students (owner_id, nickname, school_id, grade_id, school_year) values ($1, 'Ana', $2, $3, 2027) returning id",
          [IDS.parent, school, grade],
        )
      ).rows[0]!.id as string,
    );
    try {
      await withClaims("admin", async (c) => {
        expect((await c.query("select id from public.students where id = $1", [id])).rowCount).toBe(0);
      });
      await withClaims("anon", async (c) => {
        expect((await attempt(c, "select id from public.students where id = $1", [id])).code).toBe("42501");
      });
    } finally {
      await withSuperuser((c) => c.query("delete from public.students where id = $1", [id]));
    }
  });

  it("limite de 10 alunos por família", async () => {
    const school = SCHOOL_ID;
    await withClaims("parent", async (c) => {
      const grade = await gradeId(c);
      for (let i = 0; i < 10; i++) {
        const r = await attemptH(
          c,
          "insert into public.students (owner_id, nickname, school_id, grade_id, school_year) values ($1, $2, $3, $4, 2027)",
          [IDS.parent, `Aluno${i}`.replace(/[0-9]/g, ""), school, grade],
        );
        expect(r.error, String(i)).toBeNull();
      }
      const over = await attemptH(
        c,
        "insert into public.students (owner_id, nickname, school_id, grade_id, school_year) values ($1, 'Extra', $2, $3, 2027)",
        [IDS.parent, school, grade],
      );
      expect(over.error).not.toBeNull();
      expect(over.hint).toBe("limit");
    });
  });
});

describe("saved_lists: só lista publicada, só aluno do mesmo dono", () => {
  it("salva lista publicada para o próprio aluno; apaga; unique evita duplicata", async () => {
    const school = SCHOOL_ID;
    const { listId } = await withSuperuser((c) => seedInState(c, "published", { schoolId: school, slug: "ef-2", year: 2027 }));
    await withClaims("parent", async (c) => {
      const grade = await gradeId(c);
      const studentId = (
        await c.query(
          "insert into public.students (owner_id, nickname, school_id, grade_id, school_year) values ($1, 'Bia', $2, $3, 2027) returning id",
          [IDS.parent, school, grade],
        )
      ).rows[0]!.id as string;
      const saved = await attemptH(
        c,
        "insert into public.saved_lists (owner_id, student_id, list_id) values ($1, $2, $3) returning id",
        [IDS.parent, studentId, listId],
      );
      expect(saved.error).toBeNull();
      const dup = await attemptH(
        c,
        "insert into public.saved_lists (owner_id, student_id, list_id) values ($1, $2, $3)",
        [IDS.parent, studentId, listId],
      );
      expect(dup.error).not.toBeNull();
      expect(dup.code).toBe("23505");
      const id = saved.rows[0]!.id as string;
      expect((await attempt(c, "delete from public.saved_lists where id = $1", [id])).rowCount).toBe(1);
    });
  });

  it("recusa lista não publicada (draft/archived) e sem UPDATE grantado", async () => {
    const school = SCHOOL_ID;
    const draft = await withSuperuser((c) => seedInState(c, "draft", { schoolId: school, slug: "ef-3", year: 2027 }));
    const archived = await withSuperuser((c) => seedInState(c, "archived", { schoolId: school, slug: "ef-4", year: 2027 }));
    await withClaims("parent", async (c) => {
      const grade = await gradeId(c);
      const studentId = (
        await c.query(
          "insert into public.students (owner_id, nickname, school_id, grade_id, school_year) values ($1, 'Caio', $2, $3, 2027) returning id",
          [IDS.parent, school, grade],
        )
      ).rows[0]!.id as string;
      for (const listId of [draft.listId, archived.listId]) {
        const r = await attemptH(c, "insert into public.saved_lists (owner_id, student_id, list_id) values ($1, $2, $3)", [IDS.parent, studentId, listId]);
        expect(r.error, listId).not.toBeNull();
        expect(r.hint, listId).toBe("list_not_published");
      }
      const saved = (
        await c.query(
          "insert into public.saved_lists (owner_id, student_id, list_id) select $1, $2, l.id from public.school_lists l where l.school_id = $3 and l.status = 'published' limit 1 returning id",
          [IDS.parent, studentId, school],
        )
      ).rows[0];
      if (saved) {
        expect((await attempt(c, "update public.saved_lists set list_id = $2 where id = $1", [saved.id, draft.listId])).code).toBe("42501");
      }
    });
  });

  it("recusa aluno que não pertence ao dono da linha, mesmo que a RLS de students o esconda", async () => {
    const school = SCHOOL_ID;
    const { listId } = await withSuperuser((c) => seedInState(c, "published", { schoolId: school, slug: "ef-5", year: 2027 }));
    const grade = await withSuperuser((c) => gradeId(c));
    const otherStudentId = await asServiceCommitted(async (c) =>
      (
        await c.query(
          "insert into public.students (owner_id, nickname, school_id, grade_id, school_year) values ($1, 'Davi', $2, $3, 2027) returning id",
          [IDS.school_member, school, grade],
        )
      ).rows[0]!.id as string,
    );
    try {
      // service_role (sem RLS) tenta salvar em nome do parent, mas para o aluno de outro dono: o gatilho recusa.
      await withSuperuser(async (c) => {
        await c.query("begin");
        await c.query("set local role service_role");
        const r = await attemptH(c, "insert into public.saved_lists (owner_id, student_id, list_id) values ($1, $2, $3)", [IDS.parent, otherStudentId, listId]);
        expect(r.error).not.toBeNull();
        expect(r.code).toBe("42501");
        await c.query("rollback");
      });
    } finally {
      await withSuperuser((c) => c.query("delete from public.students where id = $1", [otherStudentId]));
    }
  });

  it("apagar o aluno apaga suas listas salvas (cascade)", async () => {
    const school = SCHOOL_ID;
    const { listId } = await withSuperuser((c) => seedInState(c, "published", { schoolId: school, slug: "ef-6", year: 2027 }));
    await withClaims("parent", async (c) => {
      const grade = await gradeId(c);
      const studentId = (
        await c.query(
          "insert into public.students (owner_id, nickname, school_id, grade_id, school_year) values ($1, 'Eva', $2, $3, 2027) returning id",
          [IDS.parent, school, grade],
        )
      ).rows[0]!.id as string;
      const savedId = (
        await c.query("insert into public.saved_lists (owner_id, student_id, list_id) values ($1, $2, $3) returning id", [IDS.parent, studentId, listId])
      ).rows[0]!.id as string;
      await c.query("delete from public.students where id = $1", [studentId]);
      expect((await c.query("select id from public.saved_lists where id = $1", [savedId])).rowCount).toBe(0);
    });
  });

  it("limite de 50 listas salvas por família", async () => {
    const school = SCHOOL_ID;
    const lists: string[] = [];
    for (let i = 0; i < 51; i++) {
      const { listId } = await withSuperuser((c) => seedInState(c, "published", { schoolId: school, slug: "ef-1", year: 2020 + i }));
      lists.push(listId);
    }
    await withClaims("parent", async (c) => {
      const grade = await gradeId(c);
      const studentId = (
        await c.query(
          "insert into public.students (owner_id, nickname, school_id, grade_id, school_year) values ($1, 'Gui', $2, $3, 2027) returning id",
          [IDS.parent, school, grade],
        )
      ).rows[0]!.id as string;
      for (let i = 0; i < 50; i++) {
        const r = await attemptH(c, "insert into public.saved_lists (owner_id, student_id, list_id) values ($1, $2, $3)", [IDS.parent, studentId, lists[i]]);
        expect(r.error, String(i)).toBeNull();
      }
      const over = await attemptH(c, "insert into public.saved_lists (owner_id, student_id, list_id) values ($1, $2, $3)", [IDS.parent, studentId, lists[50]]);
      expect(over.error).not.toBeNull();
      expect(over.hint).toBe("limit");
    });
  }, 60_000);
});

describe("privilégios de EXECUTE", () => {
  it("gatilhos: ninguém tem EXECUTE direto; student_nickname_valid: authenticated e service_role sim, anon não", async () => {
    await withSuperuser(async (c) => {
      const triggers = [
        "public.students_guard()",
        "public.students_check_limit()",
        "public.saved_lists_check_limit()",
        "public.saved_lists_guard()",
      ];
      for (const sig of triggers) {
        for (const role of ["anon", "authenticated", "service_role"]) {
          const r = await c.query<{ ok: boolean }>("select has_function_privilege($1, $2::regprocedure, 'execute') as ok", [role, sig]);
          expect(r.rows[0]!.ok, `${role} × ${sig}`).toBe(false);
        }
      }
      for (const role of ["authenticated", "service_role"]) {
        const r = await c.query<{ ok: boolean }>("select has_function_privilege($1, 'public.student_nickname_valid(text)'::regprocedure, 'execute') as ok", [role]);
        expect(r.rows[0]!.ok, role).toBe(true);
      }
      const anonR = await c.query<{ ok: boolean }>("select has_function_privilege('anon', 'public.student_nickname_valid(text)'::regprocedure, 'execute') as ok");
      expect(anonR.rows[0]!.ok).toBe(false);
    });
  });
});
