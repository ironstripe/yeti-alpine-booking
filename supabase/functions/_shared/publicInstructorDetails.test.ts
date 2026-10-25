import { assertEquals } from "jsr:@std/assert@1";
import { publicExpertiseByInstructor, publicLanguages } from "./publicInstructorDetails.ts";

Deno.test("languages: trimmed, deduped, no default", () => {
  assertEquals(publicLanguages([" de", "en", "de ", "", 5, null]), ["de", "en"]);
  assertEquals(publicLanguages(null), []);
  assertEquals(publicLanguages([]), []);
});

Deno.test("expertise: only exact Ski/Snowboard categories, names+category only", () => {
  const m = publicExpertiseByInstructor([
    { instructor_id: "a", capabilities: { name: "Kids", category: "Ski", id: "cap1" } as never },
    { instructor_id: "a", capabilities: { name: "Freestyle", category: "Snowboard" } },
    { instructor_id: "a", capabilities: { name: "Kids", category: "Ski" } },
    { instructor_id: "a", capabilities: { name: "Büro", category: "Intern" } },
    { instructor_id: "a", capabilities: { name: "X", category: "ski" } },
    { instructor_id: "b", capabilities: null },
  ]);
  assertEquals(m.get("a"), [{ category: "Ski", name: "Kids" }, { category: "Snowboard", name: "Freestyle" }]);
  assertEquals(Object.keys(m.get("a")![0]).sort(), ["category", "name"]);
  assertEquals(m.has("b"), false);
});
