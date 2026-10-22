# BA Copilot

A web application that supports Business Analysts through the end-to-end workflow **Prompt → UI design → Documentation (UC, SRS, Sequence) → Test cases → Traceability**. It is the software artifact of the thesis; all AI output is treated as a *draft* for the BA to review.

**Live demo:** <https://ba-copilot-vz0t.onrender.com/> — password: `123321`. After signing in, pick a user from the *Select your name…* dropdown (e.g. **Lan Nguyen**, BA Lead). Deployment guide: [DEPLOY.md](DEPLOY.md).

## 1. Running locally

Requirements: **Node.js 22.13 or later** (LTS 22 or 24 from nodejs.org); check with `node -v`. Runs on Windows, macOS and Linux. Run all commands from `ba-copilot-source/ba-copilot`.

```bash
npm install        # install dependencies (requires internet, run once)
npm run seed       # seed the sample project "Electronics Store (sample)" and 3 team members
npm start          # build the client and start the server
```

Open **http://localhost:3000** and pick a user from the *Select your name…* dropdown in the top bar (e.g. **Lan Nguyen**, BA Lead).

- To run against the submitted dataset instead of fresh seed data: skip `npm run seed`, copy `database/ba-copilot.db` to `data/ba-copilot.db` (and `database/files/` to `data/files/`), then run `npm start`.
- **Enabling Claude:** copy `.env.example` to `.env` and fill in your key (see section 6). Without a key the app runs in **Mock mode** (a rule-based generator): the full workflow still works, it is suitable for offline demos, and it serves as the baseline when comparing against the LLM in the evaluation chapter. The top bar shows either *Claude · model name* or *Mock mode*.
- `npm run dev` starts development mode with automatic rebuilds on file changes.

## 2. Database

The app uses Node's built-in **SQLite** driver (`node:sqlite`), so no database server is required. Runtime data lives in `data/` (git-ignored). The snapshot submitted with the source code lives in **`database/`**:

| File | Contents |
| --- | --- |
| `database/ba-copilot.db` | The full dataset as a single SQLite file |
| `database/ba-copilot.sql` | The same data as a SQL dump (schema + `INSERT` statements), readable in any text editor |
| `database/files/` | Files stored in the Document Repository |
| `database/ERD.md`, `ERD.png`, `ERD-day-du.png` | Entity-relationship diagrams (overview and full), plus a table list with row counts |

**Browsing the data:** install [DB Browser for SQLite](https://sqlitebrowser.org/dl/) (free) → *Open Database* → select `database/ba-copilot.db` → *Browse Data* tab. More details and sample queries: [database/README.md](database/README.md).

**Refreshing the snapshot** after using the app: `npm run export-db`. It takes a consistent snapshot of the database (safe to run while the server is up), writes the `.sql` dump, copies the Document Repository files and regenerates the ERD. The export **strips** GitHub tokens, member passwords and the session signing key. `npm run erd` only regenerates the ERD from the current schema.

## 3. Usage

There is no login screen: pick yourself from the **Select your name…** dropdown in the top bar. BA Lead permissions (Approve, Request changes, Administration, GitHub settings) are based on the selected user.

1. **Projects** – project list. **Administration** (BA Lead only): team members and their BA / BA Lead roles.
2. Click a project to open the project workspace with a **left sidebar**:
   - **Task Board** – Kanban board with 4 columns *To do → In progress → Done → Approved*, plus a *Changes requested* tag.
   - **Business Requirements** – one user story per row: US-xx ID, *As a / I want / So that*, acceptance criteria, priority; QUS quality scoring per row (AQUSA-based NLP scorer; results in the format of Tables 4–5 of the paper: `dataset/export/eval/QUS-AQUSA.md`). A module must exist before stories can be created.
   - **Deliverables** (select a module at the top of the page):
     1. *Documents*: BRD → UC Specification → SRS → FRD-NFR → API Spec (each step unlocks once the previous one is *Done*).
     2. *Diagrams*: Context → Use Case → Sequence → BPMN (rendered with Mermaid) → ERD.
     3. *Prototype*: Design Studio (region selection, comments, version history, layout suggestion, HTML export).
     4. *Test Cases*, 5. *Traceability* (Story → UC → FR → Screen → TC).
   - **Document Repository**, **AI Log**, **GitHub History**.
3. **Status and review** – on every deliverable: the BA marks it **Done**; the BA Lead clicks **Approve** or **Request changes** (no reason required — feedback goes through prototype comments). Request changes moves the deliverable and its task back to *In progress* with a tag. Editing a deliverable that is Done/Approved moves it back to *In progress*. A step cannot be marked Done until the previous step is Done.
4. **GitHub** – the BA Lead enters the repository URL, token and branch (default `main`) under *GitHub History → Settings*. On every **Approve**, the app commits exactly that deliverable's files (`.md`, prototype `.html`) to the branch, where developers and testers pick them up. *Done* does not touch GitHub.
5. **Concurrent-edit protection** – when two people edit the same deliverable, the one who saves last is told the content has changed and must reload (optimistic locking); a screen being edited shows the current editor's name. *Done*, *Approve* and *Request changes* count as changes too, so someone still looking at the old status cannot silently overwrite an approval.
6. **Permissions and data rules** – only a BA Lead can change roles, delete members, delete a project or delete a module (a BA does not see those Delete actions; until the team has a BA Lead, anyone can). The team always keeps at least one BA Lead: a BA Lead cannot demote or delete themselves, and the last BA Lead cannot be demoted or deleted. Member names are unique, and module names are unique within a project (ignoring case and extra spaces). A prototype comment's author is always the selected user; only its author or a BA Lead can delete it, while anyone can resolve it. Deleting a screen removes its comments and unlinks its tasks (the task history notes the deleted screen). A user story needs at least one of *As a / I want / So that*.

### Implemented business rules

| ID | Rule |
| --- | --- |
| BR-01 | *(Dropped in iteration 5)* Documents are generated from user stories; an approved screen is no longer required. Each document step can only be generated once the previous step is *Done*. |
| BR-02 | When an approved screen design is edited, restored or unapproved (including *Request changes*), the module's existing documents (BRD, UC Specification, SRS, FRD-NFR, API Spec – any with content, drafts included) and test cases are flagged *Outdated*; diagrams based on those documents follow, and linked tasks move back to *In progress*. A screen that was only *Done* (not approved) flags only the test cases. |
| BR-03 | Content the AI had to infer is labelled *Assumption* (`assumptions` and `isAssumption` fields). |
| BR-04 | Every test case must reference at least one requirement. AI output that violates this rule is sent back to the AI for self-correction. |

## 4. Architecture

```
client/            React UI (bundled with esbuild → public/)
  views/DesignTab  Design Studio: canvas, region selection, comments, versions
  views/DocsTab    UC / SRS / Sequence / requirements + refinement prompt
  views/TestsTab   Test cases · TraceTab: traceability · LogsTab: AI log
  components/      Renderer (component tree → UI), Mermaid, Markdown
shared/            Code shared by client and server
  design.ts        Component-tree model, validation, diff
  patch.ts         Patch engine + region-scope enforcement
  extract.ts       Extracts the intermediate model (fields, constraints, actions, navigation)
  trace.ts         Traceability matrix + coverage metrics
server/
  app.ts           REST API (plain Node http, no framework)
  service.ts       Business layer (BR-01..04, pipeline orchestration)
  repo.ts, db.ts   Persistence on Node's built-in SQLite (node:sqlite)
  ai/client.ts     Claude API client (API key, or Bearer token via a gateway): tool use for schema-constrained JSON, one self-repair retry, logging
  ai/pipelines.ts  Prompts + schemas per task
  ai/mock.ts       Rule-based generator (Mock / baseline)
  export/          DOCX export (docx library) and XLSX export (OOXML + JSZip)
scripts/
  seed.ts          Sample data (npm run seed)
  export-db.ts     Exports the DB to database/ (npm run export-db)
  erd.ts           Generates the ERD from the live schema (npm run erd)
database/          DB snapshot submitted with the source: .db, .sql, repository files, ERD
tests/             Unit + integration tests (node:test)
e2e/               End-to-end browser tests (Playwright)
```

**Key design decisions (referenced in the thesis methodology chapter):**

- **Designs as a JSON component tree.** Every node has a stable `id`, so region selections and comments stay anchored to the right element, and the AI edits via *patches* instead of regenerating the whole screen. The component library has 28 component types.
- **Region-scoped editing.** The server computes the set of nodes that may be modified (the selected region and its descendants, plus inserting siblings under the region's parent) and rejects any operation outside it. Each version records the number of blocked operations, which feeds the RQ1 measurements.
- **Two-stage document generation.** Stage (a) deterministically extracts an intermediate model from the design; stage (b) has the LLM generate UC/SRS/Sequence/Test artifacts grounded in that model. This reduces hallucinated details that are not present in the design.
- **Structured output.** Every Claude call uses a forced `tool_choice` with a JSON schema, and the result is validated. On validation failure the errors are fed back to the model for exactly one self-repair attempt.

## Layout suggestion ("Suggestion" tab in Design Studio)

This feature **implements only the method of Li et al. (2020)**, *Auto Completion of User Interface Layout Design Using Transformer-Based Tree Decoders* (arXiv:2001.05308): the **Recursive Transformer Tree Decoder** (§4.4). The task is **layout auto-completion**, not linting. No other rules or filters are applied.

- **Next element:**
  - After every change the model decodes one step and renders a **ghost box** on the canvas showing the predicted type, position and size (from the predicted bounding box).
  - **Tab** accepts, **Esc** dismisses. The panel shows the **top-3 types** with probabilities and the EOS probability ("the model thinks this container is complete").
  - Select a container to query only that container; with nothing selected, all containers are considered.
- **Complete layout:** greedy decoding until EOS (including containers generated along the way) within the selected region or the whole screen; each generated element can then be accepted individually.
- **Input:** the current design tree plus each element's bounding box measured on the canvas, discretised onto a grid of 32 columns × 40 px rows (grid parameters are read from the model config).
- **Output:** type, leaf flag, bounding box. Inserted elements get neutral default props; text content is changed via the design-editing prompt.
- **Model:** `model/recursive-layout.json`, hidden size 256, 4 layers, 4.3M parameters, **32-column × 40 px-row** grid, paper architecture (no position embedding). Trained in two steps: **pre-trained on 23,382 WebSight trees**, then **fine-tuned on the team's 785 root screens** (13,168 training trees, 80/10/10 split) with ×2 layout augmentation and dropout 0.2. On the 38-screen test set: **strict Next accuracy 19.7%** (previous 500-screen model: 8.8%), IoU ≥ 0.5 at 33.8%, Edit 37.0 s (no suggestions: 60.5 s). Beyond the paper: WebSight, coarse grid, augmentation, dropout. Full results in the format of Tables 1–3 of the paper: `dataset/export/eval/TRANSFORMER-RESULTS.md`.
  - Inference is pure TypeScript (`shared/recursive.ts`) and matches PyTorch output (`tests/recursive.test.ts`).
  - CPU latency (42 test screens): querying one container takes ~20–60 ms; a full-screen pass has a median of 0.3 s (max 0.9 s); Complete layout has a median of 0.4 s (max ~6 s on large screens).
- **Results** (`dataset/export/eval/TRANSFORMER-RESULTS.md`, re-run with `scripts/paper/eval_app_model.py`): average over the 6 BFS/DFS settings, strict metrics – F1 49.0 (paper 54.4), Next 19.7 (paper 27.8), Edit 48.7 s (paper 49.0; no suggestions 60.5 s). Table 3 (random sibling order) is reported too.
- **Limitations:**
  - no content suggestions;
  - still weak on Radio, Form and List;
  - does not detect on its own where an element is missing in the middle of a container (the paper does not address that task). Instead the BA selects an element and picks **Before / After this component**; the model then decodes one step using only the siblings before that slot (`nextAtSlot`), exactly as for the next element;
  - roughly 25× less training data than the paper, and the data was authored by Claude.
- Every impression, accept and dismiss event is logged to `suggestion_events`.

Source code:
- `shared/recursive.ts`: inference (`nextInContainer`, `nextAtSlot`, `nextElements`, `completeLayout`).
- `shared/layoutDefaults.ts`: default props for inserted elements.
- `server/service.ts`: `layoutSuggestions`, `acceptLayout`, `manualEdit`.
- `client/views/DesignTab.tsx`: ghost boxes, panel.
- `scripts/paper/train_final.sh`, `export_recursive.py`, `eval_app_model.py`: training, export, evaluation.

```bash
bash scripts/paper/train_final.sh && python3 scripts/paper/export_recursive.py --result dataset/export/eval/data-limited/final.json
python3 scripts/paper/eval_app_model.py --data data/sn80-G2-w7-r800-aug2
```

### UI completion dataset (work in progress)

Replaces WebSight and the Mock-generated synthetic data. Full specification in `dataset/AUTHORING.md`.

- **Root screens:** authored by Claude following the coverage matrix `dataset/matrix.json`: 500 screens = 5 groups × 12 domains × permission levels × layouts. The pilot batch is 50 screens in `dataset/roots/`.
- **Review:** BAs review screens on the **dataset review** page (`#/review`) against 6 criteria, then click export and send the JSON file to the team. In the pilot, each screen is reviewed by 2 independent BAs to measure inter-rater agreement.
- **Sample generation:** `npm run dataset:samples -- --reviews kq1.json,kq2.json,...` builds samples from accepted screens. Each sample contains `requirement`, `partialTree`, `targetContainerId`, `acceptedPatch`, `completedTree`, `review`. There are 4 kinds: one missing element, one missing group, one missing pair, and complete screens (empty target; for permission-restricted screens these act as trap samples). Train/val/test splits are made per root screen.
- **Training:** `npm run dataset:export && python3 scripts/train_transformer.py --samples data/dataset/tf --epochs 30`.

## 5. Testing

```bash
npm test                          # 291 unit + integration tests (incl. a mocked Claude API and Recursive TS ↔ PyTorch parity checks)
npx playwright install chromium   # first run only
npm run e2e                       # end-to-end browser run of the full workflow; screenshots saved to e2e/screenshots/
```

## 6. Environment variables

Set them in `.env` (copied from `.env.example`; `.env` is git-ignored) or under *Environment* on Render.

| Variable | Description |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude API key for calling Anthropic directly (sent in the `x-api-key` header). |
| `ANTHROPIC_AUTH_TOKEN` | Bearer token for use behind an API gateway (sent as `Authorization: Bearer`). Alternative to `ANTHROPIC_API_KEY`. If neither is set, the app runs in Mock mode. |
| `ANTHROPIC_BASE_URL` | Claude endpoint base URL, default `https://api.anthropic.com`. |
| `ANTHROPIC_MODEL` | Model to use, default `claude-sonnet-4-5`. |
| `MAX_AI_CALLS_PER_DAY` | Daily cap on Claude calls (0 = unlimited). |
| `APP_PASSWORD` | Set for public deployments: every page and API endpoint requires this password. |
| `AI_MODE=mock` | Force the rule-based generator even when a key is configured. |
| `PORT` | Server port, default 3000. |
| `DB_FILE` | Path to the SQLite file, default `data/ba-copilot.db`. |
| `DATA_DIR` | Directory for Document Repository files (`files/`), defaults to the directory of `DB_FILE`. |
| `RECURSIVE_FILE` | Path to the layout suggestion model, default `model/recursive-layout.json`. |
| `GITHUB_TOKEN` | (Optional) Fallback GitHub token for projects without their own token. Use a token scoped to write access on the target repository only. |
| `GITHUB_API_URL` | (Optional) GitHub API base URL, default `https://api.github.com`. |

## 7. Out of scope for the MVP (roadmap)

- Real per-member authentication (users currently pick themselves from *Select your name…*; member login exists on the server but is not yet wired into the UI). The deployment uses a single shared `APP_PASSWORD`.
- Inline commenting on documents (Google Docs-style).
- Encrypting GitHub tokens at rest in the DB (the `database/` export already strips them).
- Migrating to PostgreSQL when multiple server instances are needed. SQLite currently lives at `/data` on Render (kept on a persistent disk on paid plans, reset on restart on the free plan); the persistence layer is isolated in `repo.ts`, so only that layer needs replacing.
- Figma export and generating Playwright scripts from test cases.
