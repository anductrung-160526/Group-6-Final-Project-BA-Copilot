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

// =============================================================== Đợt 5 (C9): ma trận Story → UC → FR → Màn → TC
// Liên kết lấy từ dữ liệu có cấu trúc khi có (FR.useCaseCodes, UC.screenIds, TC.requirementCodes, mã US-xx nhắc trong UC);
// thiếu thì suy luận theo từ khoá (đánh dấu `inferred` để BA biết đây là liên kết do máy đoán, cần xác nhận).

export interface TraceStory {
  code: string;
  asA: string;
  iWant: string;
  soThat: string;
}
export interface TraceScreen {
  id: string;
  name: string;
  /** Tiêu đề Page (props.title) – dùng thêm khi so khớp tên. */
  title?: string;
}
export interface MatrixLink {
  code: string;
  inferred: boolean;
}
export interface MatrixRow {
  story: string | null; // mã US-xx; null = dòng không thuộc story nào
  useCase: string | null; // mã UC
  requirement: string | null; // mã FR/NFR
  screens: { id: string; inferred: boolean }[];
  tests: string[];
}
export interface TraceGaps {
  storiesWithoutUc: string[];
  useCasesWithoutFr: string[];
  frWithoutUc: string[];
  frWithoutScreen: string[];
  frWithoutTest: string[];
  screensWithoutFr: string[]; // id màn
  testsWithoutReference: string[];
}
export interface TraceMatrix {
  rows: MatrixRow[];
  storyLinks: Record<string, MatrixLink[]>; // story → UC
  gaps: TraceGaps;
  counts: {
    stories: number;
    storiesWithUc: number;
    frTotal: number;
    frWithScreen: number;
    frWithTest: number;
    useCases: number;
    useCasesWithFr: number;
  };
}

const STOP = new Set(
  "toi muon de co the duoc cac va cua cho nguoi dung he thong mot nhung khi neu thi la voi tren trong ra vao khong da se dang bang tu theo nay do nhu hay hoac moi tat ca thong tin chuc nang man hinh cho phep quan ly user i want so that as a an the to of and or be can with my in on for".split(
    " ",
  ),
);
function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !STOP.has(w));
}
const wordSet = (text: string) => new Set(words(text));
const normName = (x: string) => words(x).join(" ");

/** Story ↔ UC: UC nhắc mã story → chắc chắn; không thì ≥ 2 từ khoá của "I want" có trong tên/mô tả UC và ≥ 50% từ khoá. */
export function storyMatchesUc(story: TraceStory, uc: UseCase): MatrixLink | null {
  const ucText = [uc.name, uc.description, uc.trigger, ...uc.preconditions, ...uc.businessRules, ...uc.assumptions].join(" ");
  const codeRe = new RegExp(`\b${story.code.replace(/[-]/g, "\-")}\b`, "i");
  if (story.code && codeRe.test(ucText)) return { code: uc.code, inferred: false };
  const sw = [...wordSet(story.iWant)];
  if (!sw.length) return null;
  const uw = wordSet(`${uc.name} ${uc.description}`);
  const hit = sw.filter((w) => uw.has(w)).length;
  return hit >= Math.min(2, sw.length) && hit / sw.length >= 0.5 ? { code: uc.code, inferred: true } : null;
}

/** FR ↔ màn: qua UC.screenIds (chắc chắn); FR.source nhắc tên/mã màn (chắc chắn); hoặc ≥ 60% từ khoá tên màn có trong FR. */
export function screensOfRequirement(req: Requirement, ucs: UseCase[], screens: TraceScreen[]): { id: string; inferred: boolean }[] {
  const out = new Map<string, boolean>();
  const ids = new Set(screens.map((s) => s.id));
  for (const u of ucs) if (req.useCaseCodes.includes(u.code)) for (const id of u.screenIds) if (ids.has(id)) out.set(id, false);
  const src = normName(req.source);
  for (const s of screens) {
    if (out.has(s.id)) continue;
    if (req.source.includes(s.id) || (normName(s.name) && ` ${src} `.includes(` ${normName(s.name)} `))) {
      out.set(s.id, false);
      continue;
    }
    const fw = wordSet(`${req.statement} ${req.source}`);
    for (const nm of [s.name, s.title ?? ""]) {
      const nw = [...wordSet(nm)];
      if (!nw.length) continue;
      const hit = nw.filter((w) => fw.has(w)).length;
      if (hit >= Math.max(1, Math.ceil(nw.length * 0.6))) {
        out.set(s.id, true);
        break;
      }
    }
  }
  return [...out].map(([id, inferred]) => ({ id, inferred }));
}

export function buildTraceMatrix(input: { stories: TraceStory[]; useCases: UseCase[]; requirements: Requirement[]; screens: TraceScreen[]; tests: TestCase[] }): TraceMatrix {
  const { stories, useCases, requirements, screens, tests } = input;
  const ucCodes = new Set(useCases.map((u) => u.code));
  const reqCodes = new Set(requirements.map((r) => r.code));
  const storyLinks: Record<string, MatrixLink[]> = {};
  for (const st of stories) storyLinks[st.code] = useCases.map((u) => storyMatchesUc(st, u)).filter((x): x is MatrixLink => !!x);
  const reqScreens = new Map(requirements.map((r) => [r.code, screensOfRequirement(r, useCases, screens)]));
  const reqTests = new Map(requirements.map((r) => [r.code, tests.filter((t) => t.requirementCodes.includes(r.code)).map((t) => t.code)]));
  const reqsOfUc = (uc: string) => requirements.filter((r) => r.useCaseCodes.includes(uc));
  const rowsOfUc = (story: string | null, uc: string | null): MatrixRow[] => {
    const reqs = uc ? reqsOfUc(uc) : [];
    if (!reqs.length) return [{ story, useCase: uc, requirement: null, screens: [], tests: uc ? tests.filter((t) => t.useCaseCode === uc).map((t) => t.code) : [] }];
    return reqs.map((r) => ({ story, useCase: uc, requirement: r.code, screens: reqScreens.get(r.code) ?? [], tests: reqTests.get(r.code) ?? [] }));
  };

  const rows: MatrixRow[] = [];
  const ucSeen = new Set<string>();
  for (const st of stories) {
    const links = storyLinks[st.code];
    if (!links.length) rows.push({ story: st.code, useCase: null, requirement: null, screens: [], tests: [] });
    for (const l of links) {
      ucSeen.add(l.code);
      rows.push(...rowsOfUc(st.code, l.code));
    }
  }
  for (const u of useCases) if (!ucSeen.has(u.code)) rows.push(...rowsOfUc(null, u.code));
  const frLoose = requirements.filter((r) => !r.useCaseCodes.some((c) => ucCodes.has(c)));
  for (const r of frLoose) rows.push({ story: null, useCase: null, requirement: r.code, screens: reqScreens.get(r.code) ?? [], tests: reqTests.get(r.code) ?? [] });

  const frs = requirements.filter((r) => r.type === "FR");
  const linkedScreens = new Set([...reqScreens.values()].flatMap((l) => l.map((x) => x.id)));
  const flowSet = new Set(useCases.flatMap((u) => [`${u.code}/main`, ...u.altFlows.map((a) => `${u.code}/${a.code}`), ...u.exceptions.map((e) => `${u.code}/${e.code}`)]));
  const gaps: TraceGaps = {
    storiesWithoutUc: stories.filter((s) => !storyLinks[s.code].length).map((s) => s.code),
    useCasesWithoutFr: useCases.filter((u) => !reqsOfUc(u.code).length).map((u) => u.code),
    frWithoutUc: frLoose.filter((r) => r.type === "FR").map((r) => r.code),
    frWithoutScreen: frs.filter((r) => !(reqScreens.get(r.code) ?? []).length).map((r) => r.code),
    frWithoutTest: frs.filter((r) => !(reqTests.get(r.code) ?? []).length).map((r) => r.code),
    screensWithoutFr: screens.filter((s) => !linkedScreens.has(s.id)).map((s) => s.id),
    testsWithoutReference: tests.filter((t) => !t.requirementCodes.some((c) => reqCodes.has(c)) && !flowSet.has(`${t.useCaseCode}/${t.flowRef}`)).map((t) => t.code),
  };
  return {
    rows,
    storyLinks,
    gaps,
    counts: {
      stories: stories.length,
      storiesWithUc: stories.length - gaps.storiesWithoutUc.length,
      frTotal: frs.length,
      frWithScreen: frs.length - gaps.frWithoutScreen.length,
      frWithTest: frs.length - gaps.frWithoutTest.length,
      useCases: useCases.length,
      useCasesWithFr: useCases.length - gaps.useCasesWithoutFr.length,
    },
  };
}
