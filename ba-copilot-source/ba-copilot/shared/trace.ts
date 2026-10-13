// Ma trận truy vết Màn hình ↔ UC ↔ Requirement ↔ Test case và các chỉ số bao phủ.

import type { Requirement, TestCase, UseCase } from "./types.ts";

export interface TraceRow {
  requirement: Requirement;
  useCases: string[];
  screenIds: string[];
  tests: string[];
}

export interface Coverage {
  frTotal: number;
  frWithTests: number;
  ucTotal: number;
  ucWithScreens: number;
  flowsTotal: number;
  flowsWithTests: number;
  untestedRequirements: string[];
  useCasesWithoutScreens: string[];
  untestedFlows: string[];
  testsWithoutReference: string[];
}

export interface TraceResult {
  rows: TraceRow[];
  coverage: Coverage;
}

export function buildTrace(useCases: UseCase[], requirements: Requirement[], tests: TestCase[]): TraceResult {
  const ucByCode = new Map(useCases.map((u) => [u.code, u]));
  const rows: TraceRow[] = requirements.map((r) => {
    const ucs = r.useCaseCodes.filter((c) => ucByCode.has(c));
    const screenIds = [...new Set(ucs.flatMap((c) => ucByCode.get(c)?.screenIds ?? []))];
    const tcs = tests.filter((t) => t.requirementCodes.includes(r.code)).map((t) => t.code);
    return { requirement: r, useCases: ucs, screenIds, tests: tcs };
  });

  const frs = requirements.filter((r) => r.type === "FR");
  const frWithTests = frs.filter((r) => tests.some((t) => t.requirementCodes.includes(r.code)));
  const ucWithScreens = useCases.filter((u) => u.screenIds.length > 0);

  const flows: string[] = [];
  for (const u of useCases) {
    flows.push(`${u.code}/main`);
    for (const a of u.altFlows) flows.push(`${u.code}/${a.code}`);
    for (const e of u.exceptions) flows.push(`${u.code}/${e.code}`);
  }
  const testedFlows = new Set(tests.map((t) => `${t.useCaseCode}/${t.flowRef}`));
  const reqCodes = new Set(requirements.map((r) => r.code));
  const flowSet = new Set(flows);

  return {
    rows,
    coverage: {
      frTotal: frs.length,
      frWithTests: frWithTests.length,
      ucTotal: useCases.length,
      ucWithScreens: ucWithScreens.length,
      flowsTotal: flows.length,
      flowsWithTests: flows.filter((f) => testedFlows.has(f)).length,
      untestedRequirements: frs.filter((r) => !frWithTests.includes(r)).map((r) => r.code),
      useCasesWithoutScreens: useCases.filter((u) => !u.screenIds.length).map((u) => u.code),
      untestedFlows: flows.filter((f) => !testedFlows.has(f)),
      testsWithoutReference: tests
        .filter((t) => !t.requirementCodes.some((c) => reqCodes.has(c)) && !flowSet.has(`${t.useCaseCode}/${t.flowRef}`))
        .map((t) => t.code),
    },
  };
}

export function pct(a: number, b: number): number {
  return b === 0 ? 0 : Math.round((a / b) * 100);
}
