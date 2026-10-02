import assert from "node:assert/strict";
import { test } from "node:test";
import { publicInstructorTitle } from "../supabase/functions/_shared/publicInstructorTitle.ts";

const label = (specialization: string | null, gender: string | null, roles: string[] | null = null, website_role_title: string | null = null) =>
  publicInstructorTitle({ specialization, gender, roles, website_role_title });

test("gender-aware Ski/Snowboard labels use the recorded gender, not names", () => {
  assert.equal(label("both", "female", ["ski", "snowboard"]), "Ski- und Snowboardlehrerin");
  assert.equal(label("both", "male", ["ski", "snowboard"]), "Ski- und Snowboardlehrer");
  assert.equal(label("ski", "female"), "Skilehrerin");
  assert.equal(label("ski", "male"), "Skilehrer");
  assert.equal(label("snowboard", "female"), "Snowboardlehrerin");
  assert.equal(label("snowboard", "male"), "Snowboardlehrer");
});

test("unknown/other gender stays neutral; specialization both remains recognized", () => {
  assert.equal(label("both", null), "Ski- und Snowboardlehrperson");
  assert.equal(label("ski", "other"), "Skilehrperson");
  assert.equal(label("snowboard", "other"), "Snowboardlehrperson");
  assert.equal(label(null, null), "Schneesportlehrperson");
  assert.equal(label(null, "female"), "Schneesportlehrerin");
  assert.equal(label(null, "male"), "Schneesportlehrer");
});

test("explicit title overrides the teaching label; empty title falls back", () => {
  assert.equal(label("both", "male", ["ski", "snowboard"], " Leiter Skischule "), "Leiter Skischule");
  assert.equal(label("both", "male", ["ski", "snowboard"], "  "), "Ski- und Snowboardlehrer");
});
