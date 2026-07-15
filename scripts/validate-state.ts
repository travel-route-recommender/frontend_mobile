import { validateAppState } from "../src/core/state-integrity";
import { createDemoData } from "../src/data/mock/demoData";

const domain = createDemoData();
const report = validateAppState({
  domain,
  auth: {
    sessionKind: "member",
    currentSessionUserId: domain.currentUserId,
    preferenceTestCompleted: Boolean(domain.preferenceResultsByUserId[domain.currentUserId]),
  },
});

const countsByEntity = [...report.errors, ...report.warnings].reduce<Record<string, number>>((counts, entry) => ({
  ...counts,
  [entry.entityType]: (counts[entry.entityType] ?? 0) + 1,
}), {});

console.log(`State integrity: ${report.errors.length} error(s), ${report.warnings.length} warning(s)`);
for (const [entityType, count] of Object.entries(countsByEntity).sort(([left], [right]) => left.localeCompare(right))) {
  console.log(`- ${entityType}: ${count}`);
}
for (const entry of [...report.errors, ...report.warnings]) {
  console.log(`- [${entry.severity}] ${entry.code}`);
}

if (!report.valid) process.exitCode = 1;

