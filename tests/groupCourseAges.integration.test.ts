// Local throwaway DB only (BC_TEST_DATABASE_URL with production_schema_baseline loaded).
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
const URL = process.env.BC_TEST_DATABASE_URL;
const psql = (sql: string) => spawnSync("psql", [URL!, "-v", "ON_ERROR_STOP=1", "-Atq"], { input: sql, encoding: "utf8", env: { ...process.env, PGSSLMODE: "disable" } });
const ins = (min: string, max: string) => `insert into public.group_courses(name,discipline,min_age,max_age,max_participants,price_per_day,course_type,is_active) values('T','ski',${min},${max},8,0,'weekly',false)`;
const MIG = require("node:fs").readFileSync("supabase/pending/group_course_optional_ages.sql", "utf8");

describe.skipIf(!URL)("#46 group course ages (local schema)", () => {
  test("before migration: null ages fail 23502", () => {
    const r = psql(`begin; ${ins("null", "null")}; rollback;`);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('null value in column "min_age"');
  });
  test("after migration: fixture saves 1 course + 5 schedules; explicit kept; invalid rejected", () => {
    const r = psql(`begin; ${MIG}
      with c as (${ins("null", "null")} returning id)
      insert into public.group_course_schedules(course_id,day_of_week,start_time,end_time) select c.id,d,'10:00','12:00' from c, generate_series(1,5) d;
      select count(*)||'/'||count(min_age)||'/'||bool_and(not is_active) from public.group_courses where name='T';
      select count(*) from public.group_course_schedules s join public.group_courses g on g.id=s.course_id where g.name='T' and s.start_time='10:00' and s.end_time='12:00';
      ${ins("5", "16")} returning min_age||'-'||max_age;
      ${ins("null", "16")} returning coalesce(min_age::text,'null')||'-'||max_age;
      rollback;`);
    expect(r.stderr).toBe("");
    expect(r.stdout.trim().split("\n")).toEqual(["1/0/true", "5", "5-16", "null-16"]);
    for (const [a, b] of [["0", "10"], ["10", "5"], ["5", "100"], ["100", "null"], ["null", "0"], ["null", "-3"], ["0", "null"], ["null", "100"]]) {
      const bad = psql(`begin; ${MIG} ${ins(a, b)}; rollback;`);
      expect(bad.status).not.toBe(0);
    }
    expect(psql(`begin; ${MIG} ${MIG} rollback;`).status).not.toBe(0); // single-apply
  });
  test("rollback restores NOT NULL only when safe", () => {
    const RB = require("node:fs").readFileSync("supabase/rollback/group_course_optional_ages_rollback.sql", "utf8").replace(/^BEGIN;|COMMIT;$/gm, "");
    const safe = psql(`begin; ${MIG} ${RB} select is_nullable from information_schema.columns where table_name='group_courses' and column_name='min_age'; rollback;`);
    expect(safe.stdout.trim()).toBe("NO");
    const unsafe = psql(`begin; ${MIG} ${ins("null","null")}; ${RB} select is_nullable from information_schema.columns where table_name='group_courses' and column_name='min_age'; select count(*) from pg_constraint where conname='group_courses_age_bounds_check'; rollback;`);
    expect(unsafe.stdout.trim().split("\n")).toEqual(["YES", "0"]);
  });
});
