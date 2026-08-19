import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionsToExportJson, type SessionWithFrames } from "./index.ts";

const SAMPLE_SESSION: SessionWithFrames = {
  schemaVersion: 1,
  id: "session-1",
  deviceId: "device-abc",
  startedAt: 1000,
  endedAt: 5000,
  frames: [
    { schemaVersion: 1, sessionId: "session-1", timestamp: 1100, f0Hz: 220, peakDb: -20 },
    { schemaVersion: 1, sessionId: "session-1", timestamp: 1200, f0Hz: null, peakDb: -80 },
  ],
};

void test("sessionsToExportJson: round-trips through JSON.parse", () => {
  const json = sessionsToExportJson([SAMPLE_SESSION]);
  const parsed: unknown = JSON.parse(json);
  assert.deepEqual(parsed, [SAMPLE_SESSION]);
});

void test("sessionsToExportJson: empty array serializes to an empty JSON array", () => {
  assert.equal(sessionsToExportJson([]), "[]");
});

void test("sessionsToExportJson: preserves null f0Hz rather than dropping it", () => {
  const json = sessionsToExportJson([SAMPLE_SESSION]);
  const parsed = JSON.parse(json) as SessionWithFrames[];
  assert.equal(parsed[0].frames[1].f0Hz, null);
  assert.equal("f0Hz" in parsed[0].frames[1], true);
});
