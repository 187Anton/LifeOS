import assert from "node:assert/strict";
import test from "node:test";

import { scanText } from "../scripts/scan-secrets.mjs";

test("erkennt hochsichere Provider- und Private-Key-Muster ohne Werte auszugeben", () => {
  const githubToken = ["ghp", "_", "A".repeat(36)].join("");
  const privateKey = ["-----BEGIN ", "PRIVATE KEY-----"].join("");
  const findings = scanText(`${githubToken}\n${privateKey}`, "fixture.txt");

  assert.deepEqual(
    findings.map(({ file, line, rule }) => ({ file, line, rule })),
    [
      { file: "fixture.txt", line: 1, rule: "GitHub-Token" },
      { file: "fixture.txt", line: 2, rule: "Private-Key-Block" },
    ],
  );
  assert.doesNotMatch(JSON.stringify(findings), /A{20}/);
});

test("meldet feste sensible Zuweisungen, erlaubt aber klar synthetische Beispiele", () => {
  const unknownValue = ["real", "istic", "Value", "1234567890"].join("");
  const findings = scanText(
    [
      `client_secret = "${unknownValue}"`,
      'password = "synthetisches-passwort"',
    ].join("\n"),
    "config.txt",
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.line, 1);
  assert.equal(findings[0]?.rule, "Fest zugewiesener sensibler Wert");
});
