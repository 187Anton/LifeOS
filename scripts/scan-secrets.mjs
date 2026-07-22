#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const providerPatterns = [
  {
    name: "Private-Key-Block",
    pattern: new RegExp(
      ["-----BEGIN ", "(?:RSA |EC |OPENSSH |DSA )?", "PRIVATE KEY-----"].join(
        "",
      ),
      "g",
    ),
  },
  {
    name: "GitHub-Token",
    pattern: new RegExp(
      [
        "\\b(?:gh[pousr]_",
        "[A-Za-z0-9]{30,}|github_pat_",
        "[A-Za-z0-9_]{40,})\\b",
      ].join(""),
      "g",
    ),
  },
  {
    name: "AWS-Zugriffsschlüssel",
    pattern: new RegExp(
      ["\\b(?:AK", "IA|ASIA)", "[A-Z0-9]{16}\\b"].join(""),
      "g",
    ),
  },
  {
    name: "OpenAI-API-Schlüssel",
    pattern: new RegExp(
      ["\\bsk", "-(?:proj-)?", "[A-Za-z0-9_-]{20,}\\b"].join(""),
      "g",
    ),
  },
  {
    name: "Slack-Token",
    pattern: new RegExp(
      ["\\bxox", "[baprs]-", "[A-Za-z0-9-]{20,}\\b"].join(""),
      "g",
    ),
  },
  {
    name: "JWT",
    pattern: new RegExp(
      [
        "\\beyJ[A-Za-z0-9_-]{10,}",
        "\\.[A-Za-z0-9_-]{10,}",
        "\\.[A-Za-z0-9_-]{10,}\\b",
      ].join(""),
      "g",
    ),
  },
];

const quotedAssignmentPattern = new RegExp(
  [
    "\\b(?:password|secret|token|api[_-]?key|client[_-]?secret)\\b",
    "[\\s\"']*[:=]\\s*",
    "([\"'])([^\"'\\n]{12,})\\1",
  ].join(""),
  "gi",
);
const environmentAssignmentPattern = new RegExp(
  [
    "^\\s*[A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|API_KEY|CLIENT_SECRET)",
    "[A-Z0-9_]*\\s*=\\s*([A-Za-z0-9_./+=:@-]{12,})",
  ].join(""),
  "gim",
);

const knownSyntheticValue =
  /change-me|synthet|example|beispiel|placeholder|dummy|lifeos-ci|lokal-eingegeben|local-development|verification-only|redacted|not-a-secret|darf-nicht|ungueltig|\$\{/i;

const lineNumberAt = (text, index) => text.slice(0, index).split("\n").length;

export const scanText = (text, file = "<Text>") => {
  const findings = [];
  for (const { name, pattern } of providerPatterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      findings.push({
        file,
        line: lineNumberAt(text, match.index ?? 0),
        rule: name,
      });
    }
  }

  for (const [lineIndex, line] of text.split("\n").entries()) {
    quotedAssignmentPattern.lastIndex = 0;
    for (const match of line.matchAll(quotedAssignmentPattern)) {
      const value = match[2] ?? "";
      if (!knownSyntheticValue.test(value)) {
        findings.push({
          file,
          line: lineIndex + 1,
          rule: "Fest zugewiesener sensibler Wert",
        });
      }
    }
  }
  environmentAssignmentPattern.lastIndex = 0;
  for (const match of text.matchAll(environmentAssignmentPattern)) {
    const value = match[1] ?? "";
    if (!knownSyntheticValue.test(value)) {
      findings.push({
        file,
        line: lineNumberAt(text, match.index ?? 0),
        rule: "Fest zugewiesener sensibler Wert",
      });
    }
  }
  return findings.sort(
    (left, right) =>
      left.line - right.line || left.rule.localeCompare(right.rule),
  );
};

const trackedFiles = () => {
  const result = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
      encoding: "buffer",
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    throw new Error(
      "Die versionierten Dateien konnten nicht mit git ls-files gelesen werden.",
    );
  }
  return result.stdout.toString("utf8").split("\0").filter(Boolean);
};

const main = () => {
  const findings = [];
  for (const file of trackedFiles()) {
    const content = readFileSync(file);
    if (content.length > 5 * 1024 * 1024 || content.includes(0)) continue;
    findings.push(...scanText(content.toString("utf8"), file));
  }

  if (findings.length > 0) {
    console.error("Mögliche Secrets in versionierten Textdateien gefunden:");
    for (const finding of findings) {
      console.error(`- ${finding.file}:${finding.line} (${finding.rule})`);
    }
    console.error("Es werden bewusst keine gefundenen Werte ausgegeben.");
    process.exitCode = 1;
    return;
  }
  console.info(
    "Secret-Prüfung erfolgreich: keine verdächtigen Werte in versionierten Textdateien.",
  );
};

if (process.argv[1]?.endsWith("scan-secrets.mjs")) main();
