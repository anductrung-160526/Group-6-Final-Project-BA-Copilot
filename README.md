# BA Copilot

A web application that supports Business Analysts across the end-to-end workflow **User story → UI design → Documentation (BRD, UC, SRS, FRD-NFR, API spec) → Diagrams → Test cases → Traceability**, with a BA / BA Lead review process and automatic publishing of approved deliverables to GitHub. All AI output is treated as a *draft* for the BA to review.

## Live demo

| | |
| --- | --- |
| **URL** | <https://ba-copilot-vz0t.onrender.com/> |
| **Password** | `123321` |

1. Open the URL and enter the password.
2. Pick a user from the **Select your name…** dropdown in the top bar, e.g. **Lan Nguyen** (BA Lead — can Approve, Request changes and access Administration).
3. Open the sample project **Electronics Store (sample)** to explore every module: Task Board, Business Requirements, Deliverables (Documents, Diagrams, Prototype, Test Cases, Traceability), Document Repository, AI Log and GitHub History.

## Running locally

Requires **Node.js 22.13+** (check with `node -v`).

```bash
cd ba-copilot-source/ba-copilot
npm install        # install dependencies (once)
npm run seed       # seed the sample project and 3 team members
npm start          # build the client and start the server
```

Then open **http://localhost:3000**. Without a Claude API key the app runs in **Mock mode** (a rule-based generator) and still supports the full workflow. To enable Claude, copy `.env.example` to `.env` and fill in your key.

## Database

The app uses Node's built-in SQLite driver — no database server required. The submitted data snapshot lives in [`ba-copilot-source/ba-copilot/backend/database/`](ba-copilot-source/ba-copilot/backend/database/):

- `ba-copilot.db` — the full dataset as a single SQLite file; open it with [DB Browser for SQLite](https://sqlitebrowser.org/dl/) → *Open Database* → *Browse Data*.
- `ba-copilot.sql` — the same data as a SQL dump (schema + `INSERT` statements).
- `ERD.md`, `ERD.png`, `ERD-day-du.png` — entity-relationship diagrams (overview and full).

## Repository layout

| Path | Contents |
| --- | --- |
| [`ba-copilot-source/ba-copilot/`](ba-copilot-source/ba-copilot/) | Application root: `package.json`, `Dockerfile`, build scripts, research dataset |
| [`…/frontend/`](ba-copilot-source/ba-copilot/frontend/) | Browser side: React UI source (`src/`), static files and built bundle (`public/`), end-to-end tests (`e2e/`) |
| [`…/backend/`](ba-copilot-source/ba-copilot/backend/) | Server side: Node server source (`src/`), tests, prebuilt bundle (`dist/`), layout model, database snapshot |
| [`…/shared/`](ba-copilot-source/ba-copilot/shared/) | Code used by both frontend and backend (data types, design model, QUS, traceability, …) |
| [`docs/`](docs/) | Design documentation: design system, project plans, QUS docs |

## Further reading

- [Application README](ba-copilot-source/ba-copilot/README.md) — usage, business rules, architecture, layout suggestion, testing, environment variables.
- [DEPLOY.md](ba-copilot-source/ba-copilot/DEPLOY.md) — deploying to Render.
- [backend/database/README.md](ba-copilot-source/ba-copilot/backend/database/README.md) — browsing the data and sample queries.
