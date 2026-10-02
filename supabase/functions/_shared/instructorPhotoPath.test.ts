import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedPrivatePublishPath } from "./instructorPhotoPath.ts";

const id = "22a7e7fe-cda5-4c50-bd07-eb41d778acd0";
const other = "f3254b80-242d-4d33-9291-e55c23f1afbe";
const hash = "a".repeat(64);

test("accepts the existing hash-named current private import/manual path", () => {
  assert.equal(isAllowedPrivatePublishPath(id, `${id}/import-${hash}.jpg`), true);
  assert.equal(isAllowedPrivatePublishPath(id, `${id}/manual-${hash}.jpg`), true);
});

test("accepts only the exact dated high-resolution private import path for that instructor", () => {
  assert.equal(isAllowedPrivatePublishPath(id, `hires-20261002/${id}--manual-${hash}.jpg`), true);
  assert.equal(isAllowedPrivatePublishPath(id, `hires-20261002/${other}--manual-${hash}.jpg`), false);
  assert.equal(isAllowedPrivatePublishPath(id, `hires-20261003/${id}--manual-${hash}.jpg`), false);
});

test("rejects unrelated folders, forged filenames and path traversal", () => {
  for (const path of [
    `${id}/website-${hash}.jpg`,
    `${id}/manual-${hash}.png`,
    `${id}/../${other}/import-${hash}.jpg`,
    `hires-20261002/${id}--manual-${"z".repeat(64)}.jpg`,
    `hires-20261002/${id}--manual-${hash}.jpg/../hidden`,
    `hires-20261002/${id}--manual-${hash}.jpg.bak`,
  ]) assert.equal(isAllowedPrivatePublishPath(id, path), false, path);
});
