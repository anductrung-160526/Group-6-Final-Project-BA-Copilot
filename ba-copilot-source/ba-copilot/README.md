# BA Copilot

A web application that supports Business Analysts through the end-to-end workflow **Prompt → UI design → Documentation (UC, SRS, Sequence) → Test cases → Traceability**. It is the software artifact of the thesis; all AI output is treated as a *draft* for the BA to review.

**Live demo:** <https://ba-copilot.up.railway.app/> — password: `123321`. After signing in, pick a user from the *Select your name…* dropdown (e.g. **Lan Nguyen**, BA Lead). Deployment guide: [DEPLOY.md](DEPLOY.md).

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
   - **Business Requirements** – one user story per row: US-xx ID, *As a / I want / So that*, acceptance criteria, priority; QUS quality scoring per row. A module must exist before stories can be created.
   - **Deliverables** (select a module at the top of the page):
     1. *Documents*: BRD → UC Specification → SRS → FRD-NFR → API Spec (each step unlocks once the previous one is *Done*).
     2. *Diagrams*: Context → Use Case → Sequence → BPMN (rendered with Mermaid) → ERD.
     3. *Prototype*: Design Studio (region selection, comments, version history, layout suggestion, HTML export).
     4. *Test Cases*, 5. *Traceability* (Story → UC → FR → Screen → TC).
   - **Document Repository**, **AI Log**, **GitHub History**.
3. **Status and review** – on every deliverable: the BA marks it **Done**; the BA Lead clicks **Approve** or **Request changes** (no reason required — feedback goes through prototype comments). Request changes moves the deliverable and its task back to *In progress* with a tag. Editing a deliverable that is Done/Approved moves it back to *In progress*. A step cannot be marked Done until the previous step is Done.
4. **GitHub** – the BA Lead enters the repository URL, token and branch (default `main`) under *GitHub History → Settings*. On every **Approve**, the app commits exactly that deliverable's files (`.md`, prototype `.html`) to the branch, where developers and testers pick them up. *Done* does not touch GitHub.
5. **Concurrent-edit protection** – when two people edit the same deliverable, the one who saves last is told the content has changed and must reload (optimistic locking); a screen being edited shows the current editor's name.

### Implemented business rules

| ID | Rule |
| --- | --- |
| BR-01 | *(Dropped in iteration 5)* Documents are generated from user stories; an approved screen is no longer required. Each document step can only be generated once the previous step is *Done*. |
| BR-02 | When an approved design is edited, restored or unapproved, its existing documents and test cases are flagged *Outdated*. |
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
- **Model:** `model/recursive-layout.json`, hidden size 256, 4 layers, 4.3M parameters, **32-column × 40 px-row** grid, selected on the validation set (`dataset/export/eval/STRICT-NEXT.md`). Trained on **500 root screens (399 for training) = 2,793 trees**, 80/10/10 split, using only the team's own web data (no WebSight). On the 38-screen test set: strict Next accuracy 8.8%, IoU ≥ 0.5 at 22.8%.
  - Inference is pure TypeScript (`shared/recursive.ts`) and matches PyTorch output (`tests/recursive.test.ts`).
  - CPU latency (42 test screens): querying one container takes ~20–60 ms; a full-screen pass has a median of 0.3 s (max 0.9 s); Complete layout has a median of 0.4 s (max ~6 s on large screens).
- **Results:** `dataset/export/eval/LAYOUT-SUGGEST.md`.
  - A KLM simulation shows step-by-step suggestions save roughly 39–48% of interaction time compared with building by hand; Complete layout saves 16–43%.
  - Includes per-element-type accuracy tables.
  - Point-by-point comparison with the paper: `dataset/export/eval/PAPER-METHOD.md`.
- **Limitations:**
  - no content suggestions;
  - still weak on Radio, Form and List;
  - not designed to find elements missing from the middle of a container (the paper does not address that task);
  - roughly 25× less training data than the paper, and the data was authored by Claude.
- Every impression, accept and dismiss event is logged to `suggestion_events`.

Source code:
- `shared/recursive.ts`: inference (`nextInContainer`, `nextElements`, `completeLayout`).
- `shared/layoutDefaults.ts`: default props for inserted elements.
- `server/service.ts`: `layoutSuggestions`, `acceptLayout`, `manualEdit`.
- `client/views/DesignTab.tsx`: ghost boxes, panel.
- `scripts/paper/train_faithful.py`, `export_recursive.py`, `klm_sim.py`: training, export, evaluation.

```bash
python3 scripts/paper/train_faithful.py --data=data/paper-w7c20-r400 && python3 scripts/paper/export_recursive.py
python3 scripts/paper/klm_sim.py
```

<details><summary>History: baseline models outside the paper (bidirectional encoder, n-gram) and rule set R1–R9 – removed from the app</summary>

The sections below describe the previous version. The baseline model code (`shared/transformer.ts`, the n-gram in `shared/nextComponent.ts`) is now used only by the evaluation scripts. Rule set R1–R9, the app-side filters and the `suggest` function have been deleted.

While the BA was designing, the system looked for **missing elements** (at the end *or in the middle* of a container) and **issues to fix** within the selected region (or the whole screen).

- **Main model: tree Transformer** following Li et al. (2020), *Auto Completion of User Interface Layout Design Using Transformer-Based Tree Decoders* (arXiv:2001.05308):
  - The tree is flattened in DFS order, with a closing token `</>` per container (as in the Vanilla decoder, §4.2).
  - Each token is the sum of attribute embeddings (Eq. 5): component type + **semantic subtype** (email, password, search, submit, cancel, create…) + depth + position. The paper uses bounding-box coordinates; BA Copilot trees have no coordinates, so subtype and depth are used instead.
  - **Deviation from the paper:** bidirectional attention instead of autoregressive decoding. A tree the BA is editing is not a DFS prefix — the missing element may sit in the middle of a form. Each token predicts "the element missing right before it", and a `</>` token predicts "the element missing at the end of the container". Class 0 means nothing is missing. The subtype is predicted conditioned on the type.
  - 4 layers, d = 96, 4 heads, ~479K parameters (2.6 MB). Inference is **pure TypeScript** (`shared/transformer.ts`, no extra dependencies), ~10–25 ms per screen, matching PyTorch to within 10⁻⁵.
- **Self-supervised training:** each complete tree is randomly corrupted in one of 3 ways: left intact, random node deletion, BFS truncation. The model learns to recover what was removed.
- **Data (23,881 trees):**

  | Source | Trees | Notes |
  |---|---|---|
  | WebSight v0.2 | 22,227 | Web pages |
  | Synthetic business screens | 1,521 | Generated by the design generator to cover Table/Select/Pagination/Stat, which WebSight barely contains |
  | Internal screens | 133 | |
  | BA-approved screens | | Pulled from the DB, weighted ×5 |
- **3 suggestion types:**
  - *Add:* score = P(missing at slot) × P(type | missing) ≥ 0.3 for the whole screen, ≥ 0.15 within a selected region. The prompt is specific to the subtype, e.g. `Add a search input (Input) "Search" to the Row, right before Select "Status".`
  - *Fix:* rule set R1–R9.
  - *Review:* only produced by the n-gram fallback.
- **Fallback:** if `model/next-transformer.json` is missing, or `NEXT_MODEL=ngram` is set, the app falls back to the n-gram model with *stupid backoff* (Brants et al., 2007).
- **Apply** selects the container and pre-fills the prompt. Mock mode understands "right after…/right before…" positions. Every impression/Apply/Dismiss is logged to `suggestion_events`.
- **Continual learning:** approved screens are stored in `model_learned_trees`. The n-gram picks them up immediately; the Transformer uses them on the next retraining.

Source code:
- `shared/transformer.ts`: tree encoding, inference.
- `shared/nextComponent.ts`: n-gram, rule set, suggestion ranking.
- `server/nextModel.ts`: model loading.
- `scripts/train_transformer.py`: training.
- `scripts/eval-transformer.ts`: comparison.

### Retraining and evaluation

```bash
# data (one-off)
python scripts/websight_to_trees.py --n 30000 --out data/corpus/websight.jsonl    # requires: pip install datasets beautifulsoup4
npm run build-corpus && npm run build-synthetic -- --n 6000
# training (4-core CPU, ~5 min for 20 epochs) and evaluation
npm run export-tf-data                      # includes approved screens from the DB
pip install torch && npm run train-transformer -- --epochs 20
npm run eval-transformer -- --limit 1500    # → analysis/eval-transformer.csv
```

**Results.** Evaluated with the same setup as Li et al. 2020 (§5):
- "Partially designed" trees consist of the first 10/50/80% of nodes under two design orders, **BFS** and **DFS**.
- The 3 metrics from §5.2 are used in their **type-relaxed** form (§6 of the paper), since the trees have no coordinates:
  - **F1** over parent–child pairs between the tree the model *auto-completes* and the ground-truth tree.
  - **Next:** Top-1 accuracy for predicting the next node, plus Top-3.
  - **Edit:** Zhang–Shasha tree edit distance, converted to seconds using KLM-GOMS (insert 5.05 s; relabel 3.95 s; delete 0.1 s).
- The "No suggestion" baseline keeps the partial tree as-is, i.e. the BA adds everything manually.
- The n-gram is trained on the *same* 23,881 trees. Next is measured on 1,500 trees, F1/Edit on 500 trees (`npm run eval-transformer`).

*WebSight + internal, BFS order (cf. Table 1 of the paper):*

| Model | 10% F1 / Next / Edit | 50% F1 / Next / Edit | 80% F1 / Next / Edit |
|---|---|---|---|
| No suggestion | 20.1 / – / 55.9 | 64.3 / – / 32.0 | 86.0 / – / 14.3 |
| N-gram | 37.7 / **50.6** / 40.2 | 49.2 / 66.1 / **14.7** | 52.4 / 77.3 / 7.7 |
| Transformer | **42.2** / 46.6 / **33.9** | **75.4 / 69.1** / 15.5 | **88.4 / 79.0 / 6.3** |

*WebSight + internal, DFS order (cf. Table 2):*

| Model | 10% | 50% | 80% |
|---|---|---|---|
| No suggestion | 20.1 / – / 55.9 | 64.3 / – / 32.0 | **86.0** / – / 14.3 |
| N-gram | 38.1 / **47.3** / 39.8 | 47.4 / 74.0 / **20.1** | 51.6 / 63.6 / 11.4 |
| Transformer | **42.7** / 44.3 / **33.1** | **68.5 / 74.3** / 22.7 | 84.4 / **63.8 / 11.2** |

*Synthetic business screens (189 trees):*

| Model | BFS 10% | BFS 50% | BFS 80% | DFS 50% | DFS 80% |
|---|---|---|---|---|---|
| No suggestion | 23.5 / – / 34.2 | 64.2 / – / 20.7 | 84.8 / – / 10.0 | 64.2 / – / 20.7 | 84.8 / – / 10.0 |
| N-gram | 21.0 / 0.0 / 33.1 | 47.2 / 50.3 / 14.2 | 64.5 / 62.4 / 5.9 | 46.1 / 56.6 / 14.2 | 66.4 / 77.2 / 7.9 |
| Transformer | **50.1 / 52.9 / 10.5** | **78.8 / 69.8 / 6.5** | **91.7 / 75.1 / 1.6** | **81.0 / 63.5 / 6.8** | **90.5 / 83.1 / 2.8** |

Transformer Next Top-3 on WebSight BFS: 85.5% / 90.2% / 94.0% (paper, relaxed variant at BFS 80%: 92.9–95.3%).

**Interpretation:**
- The Transformer achieves the highest F1 in most configurations. At 50–80% the n-gram scores *below the no-suggestion baseline* on F1, because it can only append to the end of a container and therefore over-generates.
- Edit distance is very lenient towards extra elements, since deletion costs only 0.1 s under the paper's setup. That is why, at 50% on WebSight, the n-gram edges ahead on Edit despite a much lower F1.
- At DFS 80% on WebSight, the Transformer does not yet beat the no-suggestion baseline on F1 (84.4 vs 86.0).
- On business screens, the Transformer wins clearly on every metric.

*Additional task specific to our use case (not covered by the paper):* missing-element detection. One node is deleted and the model must identify both its position and type; Hit@1 / Hit@3:

| Set | N-gram | Transformer |
|---|---|---|
| WebSight + internal | 9.3% / 24.3% | **43.2% / 62.5%** |
| Synthetic business | 6.9% / 22.2% | **58.7% / 87.3%** |

False-alarm rate (complete trees still receiving an Add suggestion at the app's 0.3 threshold): 18.3% on WebSight, 14.8% on business screens. Latency ~9–15 ms per screen.

**Limitations:**
- The synthetic business data comes from the design generator itself, so results on that set are optimistic.
- WebSight is dominated by landing pages, with few forms or tables.
- A randomly deleted element is sometimes inherently unpredictable (an arbitrary Text block), so Hit@k cannot reach 100%.

**Evaluation on 30 reference screens** (`npm run eval-reference`): hand-designed by the team to mimic real products, with Sidebar/Card/Section/Modal, and never used in training. The results show the model **does not yet generalise well** to layouts that differ from its training distribution:
- Leave-one-out (removing each of 489 nodes in turn): Transformer Hit@3 11.2%, n-gram 9.2%. Input alone reaches 44.7%, Button 22%.
- 12 of 30 complete screens still receive spurious suggestions, mostly "Add Heading/Text" (a habit learned from WebSight landing pages).
- Screens with 2 elements removed (90 runs):
  - The Transformer is *more diverse*: Jaccard similarity between two different screens is 0.12 vs 0.36 for the n-gram; its most frequent "Add" suggestion accounts for 42% vs 53%.
  - But the Transformer is *less accurate*: recall 7% vs 42%. The n-gram's hits come mostly from "Add Link" to navigation bars.

<details><summary>Legacy n-gram (WebSight + internal only, 22,429 trees)</summary>

`npm run build-model` / `npm run eval-next`: Top-1/Top-3 at 50% reaches 66.4% / 88.9% on a 2,503-tree holdout. The tables above retrain the n-gram on the same data as the Transformer, hence the different numbers.
</details>

</details>

### UI completion dataset (work in progress)

Replaces WebSight and the Mock-generated synthetic data. Full specification in `dataset/AUTHORING.md`.

- **Root screens:** authored by Claude following the coverage matrix `dataset/matrix.json`: 500 screens = 5 groups × 12 domains × permission levels × layouts. The pilot batch is 50 screens in `dataset/roots/`.
- **Review:** BAs review screens on the **dataset review** page (`#/review`) against 6 criteria, then click export and send the JSON file to the team. In the pilot, each screen is reviewed by 2 independent BAs to measure inter-rater agreement.
- **Sample generation:** `npm run dataset:samples -- --reviews kq1.json,kq2.json,...` builds samples from accepted screens. Each sample contains `requirement`, `partialTree`, `targetContainerId`, `acceptedPatch`, `completedTree`, `review`. There are 4 kinds: one missing element, one missing group, one missing pair, and complete screens (empty target; for permission-restricted screens these act as trap samples). Train/val/test splits are made per root screen.
- **Training:** `npm run dataset:export && python3 scripts/train_transformer.py --samples data/dataset/tf --epochs 30`.

## 5. Testing

```bash
npm test                          # 243 unit + integration tests (incl. a mocked Claude API and Recursive TS ↔ PyTorch parity checks)
npx playwright install chromium   # first run only
npm run e2e                       # end-to-end browser run of the full workflow; screenshots saved to e2e/screenshots/
```

## 6. Environment variables

Set them in `.env` (copied from `.env.example`; `.env` is git-ignored) or under *Variables* on Railway.

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
- Migrating to PostgreSQL when multiple server instances are needed. SQLite currently runs on a Railway volume; the persistence layer is isolated in `repo.ts`, so only that layer needs replacing.
- Figma export and generating Playwright scripts from test cases.
