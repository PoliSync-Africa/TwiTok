import { spawnSync } from "node:child_process";

const result = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
});

let report;
try {
  report = JSON.parse(result.stdout || "{}");
} catch {
  console.error("Mobile dependency audit did not return valid JSON.");
  console.error(result.stderr || result.stdout || "");
  process.exit(result.status || 1);
}

const allowedUnpatched = new Set([
  "ghsa-86w9-cpqp-85rv",
  "ghsa-vfj7-8cjw-p6xm"
]);

const advisoryDetails = new Map();

function collectAdvisories(name, seen = new Set()) {
  if (seen.has(name)) return;
  seen.add(name);

  const item = report.vulnerabilities?.[name];
  if (!item) return;

  for (const entry of Array.isArray(item.via) ? item.via : []) {
    if (entry && typeof entry === "object") {
      const id = (String(entry.url ?? "").split("/").pop() || String(entry.source ?? "")).toLowerCase();
      if (id) {
        advisoryDetails.set(id, {
          id,
          severity: String(entry.severity ?? "").toLowerCase(),
          package: name,
          title: String(entry.title ?? "")
        });
      }
    } else if (typeof entry === "string") {
      collectAdvisories(entry, new Set(seen));
    }
  }
}

for (const name of Object.keys(report.vulnerabilities ?? {})) {
  collectAdvisories(name);
}

const blocking = [...advisoryDetails.values()].filter(advisory => {
  if (allowedUnpatched.has(advisory.id)) return false;
  return ["high", "critical"].includes(advisory.severity) || !advisory.severity;
});

if (blocking.length) {
  console.error(JSON.stringify({ blocking }, null, 2));
  process.exit(1);
}

const total = Number(report.metadata?.vulnerabilities?.total ?? 0);
console.log(
  `Mobile audit passed: no unapproved high/critical production vulnerabilities (${total} total findings including moderate/low).`
);
console.log("Known upstream unpatched advisories remain explicitly tracked in the audit policy.");
