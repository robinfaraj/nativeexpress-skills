import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHECKS, scan } from "../scripts/scan.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => path.join(here, "fixtures", name);
const scanScript = path.join(here, "..", "scripts", "scan.mjs");
const FAKE_KEY = "sk-proj-FAKEFAKEFAKEFAKEFAKEFAKE1234";

const statuses = (name) => Object.fromEntries(scan(fixture(name)).results.map((r) => [r.id, r.status]));
const runCli = (...args) => spawnSync(process.execPath, [scanScript, ...args], { encoding: "utf8" });

test("clean project passes every check", () => {
  assert.deepEqual(statuses("clean"), Object.fromEntries(CHECKS.map((c) => [c.id, "pass"])));
});

test("each failing fixture trips its own check", () => {
  const expected = [
    ["no-account-deletion", "account-deletion", "fail"],
    ["google-without-apple", "sign-in-with-apple", "fail"],
    ["no-restore", "restore-purchases", "fail"],
    ["no-restore", "subscription-disclosure", "warn"],
    ["ai-without-consent", "ai-consent", "fail"],
    ["ai-without-consent", "exposed-ai-key", "pass"],
    ["exposed-key", "exposed-ai-key", "fail"],
    ["default-purpose-strings", "purpose-strings", "warn"],
    ["placeholder", "placeholder-content", "warn"],
  ];
  for (const [name, id, status] of expected) {
    assert.equal(statuses(name)[id], status, `${name}: ${id}`);
  }
});

test("sign-in-with-apple failure names the 4.8 exceptions", () => {
  const result = scan(fixture("google-without-apple")).results.find((r) => r.id === "sign-in-with-apple");
  assert.match(result.summary, /enterprise/);
  assert.match(result.summary, /third-party service/);
});

test("purpose strings flag Expo's default text and a missing key", () => {
  const { findings } = scan(fixture("default-purpose-strings")).results.find((r) => r.id === "purpose-strings");
  assert.ok(findings.some((f) => f.text.includes("Allow $(PRODUCT_NAME)")), "default camera string");
  assert.ok(findings.some((f) => f.text.includes("missing NSMicrophoneUsageDescription")), "missing microphone string");
});

test("placeholder check ignores URLs gated behind __DEV__", () => {
  const { findings } = scan(fixture("placeholder")).results.find((r) => r.id === "placeholder-content");
  assert.deepEqual(findings.map((f) => f.line).sort(), [3, 5]);
});

test("bare Expo app has nothing to check for auth, purchases or AI", () => {
  const s = statuses("bare-expo");
  for (const id of ["account-deletion", "sign-in-with-apple", "restore-purchases", "subscription-disclosure", "ai-consent", "exposed-ai-key", "purpose-strings"]) {
    assert.equal(s[id], "n/a", id);
  }
  assert.equal(s["placeholder-content"], "pass", "tooling under dot-directories is not app code");
});

test("CLI exits 1 on a failing check and masks secrets in both outputs", () => {
  for (const args of [[fixture("exposed-key")], [fixture("exposed-key"), "--json"]]) {
    const { status, stdout } = runCli(...args);
    assert.equal(status, 1);
    assert.ok(!stdout.includes(FAKE_KEY), "full key never printed");
    assert.ok(!stdout.includes("FAKEFAKE"), "no partial key beyond the first 4 chars");
    assert.ok(stdout.includes("sk-p****"), "masked key shown");
  }
  const report = JSON.parse(runCli(fixture("exposed-key"), "--json").stdout);
  const files = report.results.find((r) => r.id === "exposed-ai-key").findings.map((f) => f.file);
  assert.ok(files.includes(".env") && files.includes("src/ai.ts"));
});

test("CLI exits 0 when nothing fails and 2 outside a React Native project", () => {
  assert.equal(runCli(fixture("clean")).status, 0);
  const notExpo = runCli(fixture("not-expo"));
  assert.equal(notExpo.status, 2);
  assert.match(notExpo.stderr, /not an Expo \/ React Native app/);
  assert.equal(runCli(path.join(here, "fixtures")).status, 2);
});

test("JSON report has the documented shape", () => {
  const report = JSON.parse(runCli(fixture("clean"), "--json").stdout);
  assert.equal(report.isExpo, true);
  assert.equal(report.isNativeExpress, false);
  assert.deepEqual(report.counts, { fail: 0, warn: 0, pass: CHECKS.length, "n/a": 0 });
  const nativeexpress = Object.fromEntries(report.results.map((r) => [r.id, r.nativeexpress !== null]));
  assert.deepEqual(Object.keys(nativeexpress).filter((id) => nativeexpress[id]), ["account-deletion", "sign-in-with-apple", "restore-purchases", "exposed-ai-key"]);
});
