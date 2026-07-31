import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

test("every SQL migration is registered in the Drizzle journal", async () => {
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  const migrationTags = (await readdir("drizzle"))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .map((name) => name.replace(/\.sql$/, ""))
    .sort();
  const journalTags = journal.entries.map((entry) => entry.tag).sort();

  assert.deepEqual(journalTags, migrationTags);
  assert.deepEqual(
    journal.entries.map((entry) => entry.idx),
    journal.entries.map((_, index) => index),
    "migration journal indexes must be sequential",
  );
});
