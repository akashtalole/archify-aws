#!/usr/bin/env node
// Refreshes data/wa/*.json from the live AWS documentation index (needs network access to docs.aws.amazon.com).
import { acquireCorpus, saveCorpus, SOURCES } from "../src/wa/corpus.mjs";
for (const lens of Object.keys(SOURCES)) {
  const c = await acquireCorpus(lens);
  if (!c.manifest.valid) { console.error(`${lens}: INVALID`, c.manifest.errors); process.exit(1); }
  saveCorpus(c);
  console.log(`${lens}: ${c.manifest.counts.pillars} pillars, ${c.manifest.counts.questions} questions, ${c.manifest.counts.bps} best practices`, JSON.stringify(c.manifest.counts.perPillar));
}
