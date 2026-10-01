// Server-enforced instructor access (Security Gate A).
// Directory columns are readable by every signed-in user; contact/personnel fields only
// through staff RPCs; pay/bank/AHV only through super_admin RPCs. Never select "*" on instructors.
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Instructor = Tables<"instructors">;

export const DIRECTORY_COLUMNS =
  "id, created_at, first_name, last_name, level, specialization, status, real_time_status, languages, role, roles, instructor_type, gender, avatar_url, show_on_website, website_teaser";

export const PAY_FIELDS = ["hourly_rate", "bank_name", "iban", "ahv_number"] as const;
const OPS_FIELDS = [
  "id", "first_name", "last_name", "level", "specialization", "status", "real_time_status", "languages", "role", "roles",
  "instructor_type", "gender", "avatar_url", "show_on_website", "website_teaser", "email", "phone", "street", "zip",
  "city", "country", "birth_date", "entry_date", "notes",
] as const;

const EMPTY_PRIVATE = {
  email: null, phone: null, street: null, zip: null, city: null, country: null, birth_date: null, entry_date: null,
  notes: null, hourly_rate: null, bank_name: null, iban: null, ahv_number: null,
};

const rpc = (fn: string, args?: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>)(fn, args);

function isForbidden(error: { code?: string; message: string } | null) {
  return !!error && (error.code === "42501" || /forbidden/i.test(error.message));
}

/** Staff get operational fields; others fall back to the directory projection. Pay fields are always null here. */
export async function fetchInstructors(id?: string): Promise<Instructor[]> {
  const { data, error } = await rpc("instructors_ops_list", { p_id: id ?? null });
  if (!error) return ((data as Partial<Instructor>[]) ?? []).map((r) => ({ ...EMPTY_PRIVATE, ...r }) as Instructor);
  if (!isForbidden(error)) throw error;
  let q = supabase.from("instructors").select(DIRECTORY_COLUMNS).order("last_name", { ascending: true });
  if (id) q = q.eq("id", id);
  const { data: dir, error: dirErr } = await q;
  if (dirErr) throw dirErr;
  return ((dir as unknown as Partial<Instructor>[]) ?? []).map((r) => ({ ...EMPTY_PRIVATE, ...r }) as Instructor);
}

export async function fetchInstructor(id: string): Promise<Instructor | null> {
  return (await fetchInstructors(id))[0] ?? null;
}

export type InstructorPay = Pick<Instructor, "id" | "hourly_rate" | "bank_name" | "iban" | "ahv_number">;

/** super_admin only; returns [] for everyone else. */
export async function fetchInstructorPay(id?: string): Promise<InstructorPay[]> {
  const { data, error } = await rpc("instructors_pay_list", { p_id: id ?? null });
  if (error) {
    if (isForbidden(error)) return [];
    throw error;
  }
  return (data as InstructorPay[]) ?? [];
}

/** Writes operational fields (staff). Pay fields are sent (to the super_admin-only RPC) only when withPay is set. */
export async function saveInstructor(
  values: Record<string, unknown>,
  opts: { withPay?: boolean } = {},
): Promise<string> {
  const ops: Record<string, unknown> = {};
  const pay: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) continue;
    if ((OPS_FIELDS as readonly string[]).includes(k)) ops[k] = v;
    else if (opts.withPay && (PAY_FIELDS as readonly string[]).includes(k)) pay[k] = v;
  }
  const { data, error } = await rpc("instructor_ops_upsert", { p: ops });
  if (error) throw error;
  const id = data as string;
  if (Object.keys(pay).length > 0) {
    const { error: payErr } = await rpc("instructor_pay_update", { p_id: id, p: pay });
    if (payErr) throw payErr;
  }
  return id;
}

export async function deleteInstructor(id: string) {
  const { error } = await rpc("instructor_delete", { p_id: id });
  if (error) throw error;
}

export type InstructorSelf = Omit<Instructor, "notes" | (typeof PAY_FIELDS)[number] | "created_at" | "instructor_type" | "show_on_website" | "website_teaser">;

export async function fetchInstructorSelf(): Promise<InstructorSelf | null> {
  const { data, error } = await rpc("instructor_self");
  if (error) throw error;
  return ((data as InstructorSelf[]) ?? [])[0] ?? null;
}

export async function updateInstructorSelf(p: { phone?: string | null; languages?: string[] }) {
  const { error } = await rpc("instructor_self_update", { p });
  if (error) throw error;
}
