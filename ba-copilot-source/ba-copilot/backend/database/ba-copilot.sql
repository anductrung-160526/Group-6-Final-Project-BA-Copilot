-- BA Copilot – cấu trúc và dữ liệu cơ sở dữ liệu (SQLite)
-- Xuất lúc 2026-10-21T02:41:02.280Z bằng: npm run export-db
-- Nạp lại: sqlite3 ba-copilot-moi.db < ba-copilot.sql   (hoặc DB Browser for SQLite → File → Import → Database from SQL file)
-- Đã xoá bí mật: token GitHub, mật khẩu thành viên, khoá ký phiên.
PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

-- Bảng annotations
CREATE TABLE annotations (
  id TEXT PRIMARY KEY, screen_id TEXT NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL, node_ids TEXT NOT NULL, bbox TEXT, comment TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'BA', status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL
, author_id TEXT REFERENCES members(id) ON DELETE SET NULL);
INSERT INTO "annotations" ("id", "screen_id", "version_id", "node_ids", "bbox", "comment", "author", "status", "created_at", "author_id") VALUES ('98003b4d-a2a6-48db-a879-5bd758b4c09d', 'efb6f8ee-f468-4a65-b7f7-401fb409e23f', '41ebbd33-6e45-480c-bdd9-ad6b4b721d1e', '[]', 'null', 'Add a product image picker and a price format hint (USD).', 'Lan Nguyen', 'open', '2026-10-21T02:15:54.449Z', 'demo-mem-lan');

-- Bảng app_meta
CREATE TABLE app_meta (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
);
INSERT INTO "app_meta" ("key", "value", "updated_at") VALUES ('migration:d5.docs', '2026-10-20T16:09:04.606Z', '2026-10-20T16:09:04.606Z');
INSERT INTO "app_meta" ("key", "value", "updated_at") VALUES ('migration:d5.diagrams', '2026-10-20T16:09:04.612Z', '2026-10-20T16:09:04.612Z');
INSERT INTO "app_meta" ("key", "value", "updated_at") VALUES ('migration:d5.stories', '2026-10-20T16:09:04.625Z', '2026-10-20T16:09:04.625Z');
INSERT INTO "app_meta" ("key", "value", "updated_at") VALUES ('migration:d6.prereq', '2026-10-21T02:15:53.916Z', '2026-10-21T02:15:53.916Z');

-- Bảng files
CREATE TABLE files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  module_id TEXT REFERENCES modules(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'upload',
  created_at TEXT NOT NULL
, sender TEXT NOT NULL DEFAULT '', received_at TEXT, note TEXT NOT NULL DEFAULT '', uploaded_by TEXT REFERENCES members(id) ON DELETE SET NULL);

-- Bảng git_pushes
CREATE TABLE git_pushes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  module_id TEXT REFERENCES modules(id) ON DELETE SET NULL,
  artifact_kind TEXT NOT NULL CHECK(artifact_kind IN ('screen','doc','diagram','tests')),
  artifact_id TEXT NOT NULL,
  artifact_sub TEXT,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  branch TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  commit_url TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  files TEXT NOT NULL DEFAULT '[]',
  by_member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

-- Bảng members
CREATE TABLE members (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'BA' CHECK(role IN ('BA','BA_LEAD')), created_at TEXT NOT NULL
, password_hash TEXT);
INSERT INTO "members" ("id", "name", "role", "created_at", "password_hash") VALUES ('demo-mem-lan', 'Lan Nguyen', 'BA_LEAD', '2026-09-20T06:05:26.239Z', NULL);
INSERT INTO "members" ("id", "name", "role", "created_at", "password_hash") VALUES ('demo-mem-duc', 'Duc Tran', 'BA', '2026-09-21T06:05:26.240Z', NULL);
INSERT INTO "members" ("id", "name", "role", "created_at", "password_hash") VALUES ('demo-mem-anh', 'Anh Le', 'BA', '2026-09-22T06:05:26.240Z', NULL);

-- Bảng model_learned_trees
CREATE TABLE model_learned_trees (
  version_id TEXT PRIMARY KEY, screen_id TEXT NOT NULL, tree TEXT NOT NULL, created_at TEXT NOT NULL
);

-- Bảng module_diagrams
CREATE TABLE module_diagrams (
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('CONTEXT','UC','SEQUENCE','BPMN','ERD')),
  code TEXT NOT NULL DEFAULT '',
  parts TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('none','draft','done','approved','outdated')),
  revision_requested INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (module_id, kind)
);
INSERT INTO "module_diagrams" ("module_id", "kind", "code", "parts", "status", "revision_requested", "rev", "updated_by", "updated_at") VALUES ('demo-mod-products', 'CONTEXT', 'flowchart LR
  %% diagram: CONTEXT – system in the centre, actors (rounded rectangles), external systems (double boxes)
  SYS(("Product Management"))
  ACT1("Administrator")
  ACT2("BA Lead / Product Owner")
  ACT1 -->|"search products by name or SKU"| SYS
  SYS -->|"Results, notifications"| ACT1
  ACT2 -->|"Requests, input data"| SYS
  SYS -->|"Results, notifications"| ACT2', '[]', 'draft', 0, 2, 'demo-mem-lan', '2026-10-21T02:25:32.745Z');
INSERT INTO "module_diagrams" ("module_id", "kind", "code", "parts", "status", "revision_requested", "rev", "updated_by", "updated_at") VALUES ('demo-mod-products', 'UC', 'flowchart LR
  %% nguon-uc: b5fdf3c0
  A1(("Administrator"))
  subgraph SYS["System"]
    direction TB
    UC1(["UC-01: Search products by name or SKU"])
    UC2(["UC-02: Add a new product with name, SKU, category, price and stock"])
    UC3(["UC-03: Edit the price and stock of a product"])
    UC4(["UC-04: Filter products by category and status"])
    UC5(["UC-05: Discontinue a product"])
  end
  A1 --- UC1
  A1 --- UC2
  A1 --- UC3
  A1 --- UC4
  A1 --- UC5', '[]', 'approved', 0, 1, 'demo-mem-anh', '2026-10-21T02:15:54.344Z');
INSERT INTO "module_diagrams" ("module_id", "kind", "code", "parts", "status", "revision_requested", "rev", "updated_by", "updated_at") VALUES ('demo-mod-products', 'SEQUENCE', '', '[{"key":"UC-01","title":"UC-01 – Search products by name or SKU","code":"sequenceDiagram\n  autonumber\n  actor A as Administrator\n  participant UI as User interface\n  participant API as API Server\n  participant DB as Database\n  A->>UI: Selects the ''Search products by name or SKU'' function\n  API->>DB: Query / update data\n  DB-->>API: Result\n  API-->>UI: Response\n  UI-->>A: Displays the data list and the filter fields\n  A->>UI: Enters or selects the search criteria\n  API->>DB: Query / update data\n  DB-->>API: Result\n  API-->>UI: Response\n  UI-->>A: Filters and displays the matching results\n  alt No matching data\n    UI-->>A: System displays the message ''No matching data found''\n  end"},{"key":"UC-02","title":"UC-02 – Add a new product with name, SKU, category, price and stock","code":"sequenceDiagram\n  autonumber\n  actor A as Administrator\n  participant UI as User interface\n  participant API as API Server\n  participant DB as Database\n  A->>UI: Selects the ''Add a new product with name, SKU, category, price and stock'' function\n  UI-->>A: Displays the corresponding screen / form\n  A->>UI: Enters or selects the required information and confirms\n  UI->>API: Send request\n  API->>API: Validates the data against the business rules\n  API->>DB: Query / update data\n  DB-->>API: Result\n  API-->>UI: Response\n  UI-->>A: Saves the result and shows a success message\n  alt Invalid data\n    UI-->>A: System shows an error on the invalid field\n    UI-->>A: Return to step 3\n  else System error while saving\n    UI-->>A: System reports that saving failed and keeps the entered data\n  end"},{"key":"UC-03","title":"UC-03 – Edit the price and stock of a product","code":"sequenceDiagram\n  autonumber\n  actor A as Administrator\n  participant UI as User interface\n  participant API as API Server\n  participant DB as Database\n  A->>UI: Selects the ''Edit the price and stock of a product'' function\n  UI-->>A: Displays the corresponding screen / form\n  A->>UI: Enters or selects the required information and confirms\n  UI->>API: Send request\n  API->>API: Validates the data against the business rules\n  API->>DB: Query / update data\n  DB-->>API: Result\n  API-->>UI: Response\n  UI-->>A: Saves the result and shows a success message\n  alt Invalid data\n    UI-->>A: System shows an error on the invalid field\n    UI-->>A: Return to step 3\n  else System error while saving\n    UI-->>A: System reports that saving failed and keeps the entered data\n  end"},{"key":"UC-04","title":"UC-04 – Filter products by category and status","code":"sequenceDiagram\n  autonumber\n  actor A as Administrator\n  participant UI as User interface\n  participant API as API Server\n  participant DB as Database\n  A->>UI: Selects the ''Filter products by category and status'' function\n  API->>DB: Query / update data\n  DB-->>API: Result\n  API-->>UI: Response\n  UI-->>A: Displays the data list and the filter fields\n  A->>UI: Enters or selects the search criteria\n  API->>DB: Query / update data\n  DB-->>API: Result\n  API-->>UI: Response\n  UI-->>A: Filters and displays the matching results\n  alt No matching data\n    UI-->>A: System displays the message ''No matching data found''\n  end"},{"key":"UC-05","title":"UC-05 – Discontinue a product","code":"sequenceDiagram\n  autonumber\n  actor A as Administrator\n  participant UI as User interface\n  participant API as API Server\n  participant DB as Database\n  A->>UI: Selects the ''Discontinue a product'' function\n  UI-->>A: Displays the corresponding screen / form\n  A->>UI: Enters or selects the required information and confirms\n  UI->>API: Send request\n  API->>API: Validates the data against the business rules\n  API->>DB: Query / update data\n  DB-->>API: Result\n  API-->>UI: Response\n  UI-->>A: Saves the result and shows a success message\n  alt Invalid data\n    UI-->>A: System shows an error on the invalid field\n    UI-->>A: Return to step 3\n  else System error while saving\n    UI-->>A: System reports that saving failed and keeps the entered data\n  end"}]', 'done', 0, 1, 'demo-mem-anh', '2026-10-21T02:15:54.353Z');
INSERT INTO "module_diagrams" ("module_id", "kind", "code", "parts", "status", "revision_requested", "rev", "updated_by", "updated_at") VALUES ('demo-mod-products', 'BPMN', 'flowchart LR
  %% BPMN simulated with Mermaid: lane = subgraph, event = circle, task = rounded rectangle, gateway = diamond
  subgraph L1["Administrator"]
    direction LR
    N1(("Start"))
    N2("Search products by name or SKU")
    N5("Add a new product with name, SKU, category, price and stock")
    N8("Edit the price and stock of a product")
    N11("Filter products by category and status")
    N14("Discontinue a product")
    N17((("End")))
  end
  subgraph L2["System"]
    direction LR
    N3("Displays the data list and the filter fields")
    N4{"Valid?"}
    N6("Displays the corresponding screen / form")
    N7{"Valid?"}
    N9("Displays the corresponding screen / form")
    N10{"Valid?"}
    N12("Displays the data list and the filter fields")
    N13{"Valid?"}
    N15("Displays the corresponding screen / form")
    N16{"Valid?"}
  end
  N1 --> N2
  N2 --> N3
  N3 --> N4
  N4 -->|"No – No matching data"| N2
  N4 -->|"Yes"| N5
  N5 --> N6
  N6 --> N7
  N7 -->|"No – Invalid data"| N5
  N7 -->|"Yes"| N8
  N8 --> N9
  N9 --> N10
  N10 -->|"No – Invalid data"| N8
  N10 -->|"Yes"| N11
  N11 --> N12
  N12 --> N13
  N13 -->|"No – No matching data"| N11
  N13 -->|"Yes"| N14
  N14 --> N15
  N15 --> N16
  N16 -->|"No – Invalid data"| N14
  N16 -->|"Yes"| N17', '[]', 'done', 0, 1, 'demo-mem-anh', '2026-10-21T02:15:54.362Z');
INSERT INTO "module_diagrams" ("module_id", "kind", "code", "parts", "status", "revision_requested", "rev", "updated_by", "updated_at") VALUES ('demo-mod-products', 'ERD', 'erDiagram
  %% diagram: ERD – entities, key attributes, relationships
  USER["User"] {
    uuid id PK "Identifier"
    string full_name "Full name"
    string email UK "Email"
    string role "Role"
  }
  PRODUCTS["Products"] {
    uuid id PK "Identifier"
    string code UK "Products code"
    string name "Name"
    string status "Status"
    uuid created_by_id FK "Created by"
    datetime created_at "Created at"
  }
  MATCHES_PART["Matches part"] {
    uuid id PK "Identifier"
    string code UK "Matches part code"
    string name "Name"
    string status "Status"
    uuid created_by_id FK "Created by"
    datetime created_at "Created at"
  }
  PRODUCT["Product"] {
    uuid id PK "Identifier"
    string code UK "Product code"
    string name "Name"
    string status "Status"
    uuid created_by_id FK "Created by"
    datetime created_at "Created at"
  }
  PRICE["Price"] {
    uuid id PK "Identifier"
    string code UK "Price code"
    string name "Name"
    string status "Status"
    uuid created_by_id FK "Created by"
    datetime created_at "Created at"
  }
  BOX["Box"] {
    uuid id PK "Identifier"
    string code UK "Box code"
    string name "Name"
    string status "Status"
    uuid created_by_id FK "Created by"
    datetime created_at "Created at"
  }
  CRITERIA["Criteria"] {
    uuid id PK "Identifier"
    string code UK "Criteria code"
    string name "Name"
    string status "Status"
    uuid created_by_id FK "Created by"
    datetime created_at "Created at"
  }
  USER ||--o{ PRODUCTS : "creates"
  USER ||--o{ MATCHES_PART : "creates"
  USER ||--o{ PRODUCT : "creates"
  USER ||--o{ PRICE : "creates"
  USER ||--o{ BOX : "creates"
  USER ||--o{ CRITERIA : "creates"
  PRODUCTS ||--o{ PRODUCT : "contains"
  PRODUCT ||--o{ PRICE : "contains"
  PRODUCT ||--o{ CRITERIA : "contains"', '[]', 'draft', 0, 1, 'demo-mem-duc', '2026-10-21T02:15:54.372Z');

-- Bảng module_docs
CREATE TABLE module_docs (
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('BRD','UC_SPEC','SRS','FRD_NFR','API_SPEC')),
  content TEXT NOT NULL DEFAULT '',
  data TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('none','draft','done','approved','outdated')),
  revision_requested INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (module_id, kind)
);
INSERT INTO "module_docs" ("module_id", "kind", "content", "data", "status", "revision_requested", "rev", "updated_by", "updated_at") VALUES ('demo-mod-products', 'BRD', '# BRD – Product Management

## 1. Background and Objectives

Module **Product Management** is built to satisfy 5 user stories from: Administrator.

Business objectives:
- I can check stock before restocking (US-01)
- The product can go on sale on the website (US-02)
- The information on the website is always correct (US-03)
- I can review prices for each product group (US-04)
- Customers cannot order discontinued items (US-05)

## 2. Scope

### In Scope
- Search products by name or SKU (US-01)
- Add a new product with name, SKU, category, price and stock (US-02)
- Edit the price and stock of a product (US-03)
- Filter products by category and status (US-04)
- Discontinue a product (US-05)

### Out of Scope
- Features not listed in the module''s user stories (any addition must be confirmed by the BA).
- Integration with external systems that have not been described.

## 3. Stakeholders

| Stakeholder | Role | Related stories |
|---|---|---|
| Administrator | Direct user of the feature | US-01, US-02, US-03, US-04, US-05 |
| BA Lead / Product Owner | Approves requirements and performs acceptance | All |

## 4. Business Requirements

| ID | Business requirement | Benefit | Priority | Story |
|---|---|---|---|---|
| BR-01 | Administrator can search products by name or SKU | I can check stock before restocking | High | US-01 |
| BR-02 | Administrator can add a new product with name, SKU, category, price and stock | The product can go on sale on the website | High | US-02 |
| BR-03 | Administrator can edit the price and stock of a product | The information on the website is always correct | Medium | US-03 |
| BR-04 | Administrator can filter products by category and status | I can review prices for each product group | Medium | US-04 |
| BR-05 | Administrator can discontinue a product | Customers cannot order discontinued items | Low | US-05 |

## 5. Acceptance Criteria

### US-01 – Search products by name or SKU
- Search matches part of the name, case-insensitive
- When there are no results, show the message ''No products found''
- Results are paginated at 20 rows per page

### US-02 – Add a new product with name, SKU, category, price and stock
- Product name is required, up to 100 characters
- SKU must be unique
- Price must be greater than 0

### US-03 – Edit the price and stock of a product
- On successful save, show a confirmation and refresh the list
- Stock cannot be negative

### US-04 – Filter products by category and status
- Filters can be combined with the search box
- There is an ''All categories'' option

### US-05 – Discontinue a product
- Ask for confirmation before discontinuing
- Discontinued products are not shown on the website

## 6. Assumptions and Constraints

- Users have been given an account and the appropriate permissions before using the feature.
- Content is derived from the user stories; unclear points must be confirmed by the BA with the stakeholders.
', NULL, 'approved', 0, 1, 'demo-mem-duc', '2026-10-21T02:15:54.248Z');
INSERT INTO "module_docs" ("module_id", "kind", "content", "data", "status", "revision_requested", "rev", "updated_by", "updated_at") VALUES ('demo-mod-products', 'UC_SPEC', '# UC Specification – Product Management

## UC-01 – Search products by name or SKU

**Actor:** Administrator

**Source stories:** US-01

**Description:** Administrator wants to search products by name or SKU so that I can check stock before restocking.

**Trigger:** Administrator selects the "Search products by name or SKU" function

**Preconditions:**
- Administrator is signed in and has permission to use the function

**Postconditions:**
- Goal achieved: I can check stock before restocking

**Main flow:**
1. Administrator: Selects the "Search products by name or SKU" function
2. System: Displays the data list and the filter fields
3. Administrator: Enters or selects the search criteria
4. System: Filters and displays the matching results

**A1 – User cancels the operation** (branches from step 3):
1. Administrator selects Cancel
2. System closes the screen without saving changes

**E1 – No matching data** (branches from step 4):
1. System displays the message "No matching data found"

**Business rules:**
- Search matches part of the name, case-insensitive
- When there are no results, show the message ''No products found''
- Results are paginated at 20 rows per page

## UC-02 – Add a new product with name, SKU, category, price and stock

**Actor:** Administrator

**Source stories:** US-02

**Description:** Administrator wants to add a new product with name, SKU, category, price and stock so that the product can go on sale on the website.

**Trigger:** Administrator selects the "Add a new product with name, SKU, category, price and stock" function

**Preconditions:**
- Administrator is signed in and has permission to use the function

**Postconditions:**
- Goal achieved: the product can go on sale on the website

**Main flow:**
1. Administrator: Selects the "Add a new product with name, SKU, category, price and stock" function
2. System: Displays the corresponding screen / form
3. Administrator: Enters or selects the required information and confirms
4. System: Validates the data against the business rules
5. System: Saves the result and shows a success message

**A1 – User cancels the operation** (branches from step 3):
1. Administrator selects Cancel
2. System closes the screen without saving changes

**E1 – Invalid data** (branches from step 4):
1. System shows an error on the invalid field
2. Return to step 3

**E2 – System error while saving** (branches from step 5):
1. System reports that saving failed and keeps the entered data

**Business rules:**
- Product name is required, up to 100 characters
- SKU must be unique
- Price must be greater than 0

## UC-03 – Edit the price and stock of a product

**Actor:** Administrator

**Source stories:** US-03

**Description:** Administrator wants to edit the price and stock of a product so that the information on the website is always correct.

**Trigger:** Administrator selects the "Edit the price and stock of a product" function

**Preconditions:**
- Administrator is signed in and has permission to use the function

**Postconditions:**
- Goal achieved: the information on the website is always correct

**Main flow:**
1. Administrator: Selects the "Edit the price and stock of a product" function
2. System: Displays the corresponding screen / form
3. Administrator: Enters or selects the required information and confirms
4. System: Validates the data against the business rules
5. System: Saves the result and shows a success message

**A1 – User cancels the operation** (branches from step 3):
1. Administrator selects Cancel
2. System closes the screen without saving changes

**E1 – Invalid data** (branches from step 4):
1. System shows an error on the invalid field
2. Return to step 3

**E2 – System error while saving** (branches from step 5):
1. System reports that saving failed and keeps the entered data

**Business rules:**
- On successful save, show a confirmation and refresh the list
- Stock cannot be negative

## UC-04 – Filter products by category and status

**Actor:** Administrator

**Source stories:** US-04

**Description:** Administrator wants to filter products by category and status so that I can review prices for each product group.

**Trigger:** Administrator selects the "Filter products by category and status" function

**Preconditions:**
- Administrator is signed in and has permission to use the function

**Postconditions:**
- Goal achieved: I can review prices for each product group

**Main flow:**
1. Administrator: Selects the "Filter products by category and status" function
2. System: Displays the data list and the filter fields
3. Administrator: Enters or selects the search criteria
4. System: Filters and displays the matching results

**A1 – User cancels the operation** (branches from step 3):
1. Administrator selects Cancel
2. System closes the screen without saving changes

**E1 – No matching data** (branches from step 4):
1. System displays the message "No matching data found"

**Business rules:**
- Filters can be combined with the search box
- There is an ''All categories'' option

## UC-05 – Discontinue a product

**Actor:** Administrator

**Source stories:** US-05

**Description:** Administrator wants to discontinue a product so that customers cannot order discontinued items.

**Trigger:** Administrator selects the "Discontinue a product" function

**Preconditions:**
- Administrator is signed in and has permission to use the function

**Postconditions:**
- Goal achieved: customers cannot order discontinued items

**Main flow:**
1. Administrator: Selects the "Discontinue a product" function
2. System: Displays the corresponding screen / form
3. Administrator: Enters or selects the required information and confirms
4. System: Validates the data against the business rules
5. System: Saves the result and shows a success message

**A1 – User cancels the operation** (branches from step 3):
1. Administrator selects Cancel
2. System closes the screen without saving changes

**E1 – Invalid data** (branches from step 4):
1. System shows an error on the invalid field
2. Return to step 3

**E2 – System error while saving** (branches from step 5):
1. System reports that saving failed and keeps the entered data

**Business rules:**
- Ask for confirmation before discontinuing
- Discontinued products are not shown on the website
', '{"useCases":[{"code":"UC-01","name":"Search products by name or SKU","actors":["Administrator"],"storyCodes":["US-01"],"description":"Administrator wants to search products by name or SKU so that I can check stock before restocking.","trigger":"Administrator selects the \"Search products by name or SKU\" function","preconditions":["Administrator is signed in and has permission to use the function"],"postconditions":["Goal achieved: I can check stock before restocking"],"mainFlow":[{"no":1,"actor":"Administrator","text":"Selects the \"Search products by name or SKU\" function"},{"no":2,"actor":"System","text":"Displays the data list and the filter fields"},{"no":3,"actor":"Administrator","text":"Enters or selects the search criteria"},{"no":4,"actor":"System","text":"Filters and displays the matching results"}],"altFlows":[{"code":"A1","name":"User cancels the operation","branchFrom":3,"steps":["Administrator selects Cancel","System closes the screen without saving changes"]}],"exceptions":[{"code":"E1","name":"No matching data","branchFrom":4,"steps":["System displays the message \"No matching data found\""]}],"businessRules":["Search matches part of the name, case-insensitive","When there are no results, show the message ''No products found''","Results are paginated at 20 rows per page"],"screenIds":[],"assumptions":[]},{"code":"UC-02","name":"Add a new product with name, SKU, category, price and stock","actors":["Administrator"],"storyCodes":["US-02"],"description":"Administrator wants to add a new product with name, SKU, category, price and stock so that the product can go on sale on the website.","trigger":"Administrator selects the \"Add a new product with name, SKU, category, price and stock\" function","preconditions":["Administrator is signed in and has permission to use the function"],"postconditions":["Goal achieved: the product can go on sale on the website"],"mainFlow":[{"no":1,"actor":"Administrator","text":"Selects the \"Add a new product with name, SKU, category, price and stock\" function"},{"no":2,"actor":"System","text":"Displays the corresponding screen / form"},{"no":3,"actor":"Administrator","text":"Enters or selects the required information and confirms"},{"no":4,"actor":"System","text":"Validates the data against the business rules"},{"no":5,"actor":"System","text":"Saves the result and shows a success message"}],"altFlows":[{"code":"A1","name":"User cancels the operation","branchFrom":3,"steps":["Administrator selects Cancel","System closes the screen without saving changes"]}],"exceptions":[{"code":"E1","name":"Invalid data","branchFrom":4,"steps":["System shows an error on the invalid field","Return to step 3"]},{"code":"E2","name":"System error while saving","branchFrom":5,"steps":["System reports that saving failed and keeps the entered data"]}],"businessRules":["Product name is required, up to 100 characters","SKU must be unique","Price must be greater than 0"],"screenIds":[],"assumptions":[]},{"code":"UC-03","name":"Edit the price and stock of a product","actors":["Administrator"],"storyCodes":["US-03"],"description":"Administrator wants to edit the price and stock of a product so that the information on the website is always correct.","trigger":"Administrator selects the \"Edit the price and stock of a product\" function","preconditions":["Administrator is signed in and has permission to use the function"],"postconditions":["Goal achieved: the information on the website is always correct"],"mainFlow":[{"no":1,"actor":"Administrator","text":"Selects the \"Edit the price and stock of a product\" function"},{"no":2,"actor":"System","text":"Displays the corresponding screen / form"},{"no":3,"actor":"Administrator","text":"Enters or selects the required information and confirms"},{"no":4,"actor":"System","text":"Validates the data against the business rules"},{"no":5,"actor":"System","text":"Saves the result and shows a success message"}],"altFlows":[{"code":"A1","name":"User cancels the operation","branchFrom":3,"steps":["Administrator selects Cancel","System closes the screen without saving changes"]}],"exceptions":[{"code":"E1","name":"Invalid data","branchFrom":4,"steps":["System shows an error on the invalid field","Return to step 3"]},{"code":"E2","name":"System error while saving","branchFrom":5,"steps":["System reports that saving failed and keeps the entered data"]}],"businessRules":["On successful save, show a confirmation and refresh the list","Stock cannot be negative"],"screenIds":[],"assumptions":[]},{"code":"UC-04","name":"Filter products by category and status","actors":["Administrator"],"storyCodes":["US-04"],"description":"Administrator wants to filter products by category and status so that I can review prices for each product group.","trigger":"Administrator selects the \"Filter products by category and status\" function","preconditions":["Administrator is signed in and has permission to use the function"],"postconditions":["Goal achieved: I can review prices for each product group"],"mainFlow":[{"no":1,"actor":"Administrator","text":"Selects the \"Filter products by category and status\" function"},{"no":2,"actor":"System","text":"Displays the data list and the filter fields"},{"no":3,"actor":"Administrator","text":"Enters or selects the search criteria"},{"no":4,"actor":"System","text":"Filters and displays the matching results"}],"altFlows":[{"code":"A1","name":"User cancels the operation","branchFrom":3,"steps":["Administrator selects Cancel","System closes the screen without saving changes"]}],"exceptions":[{"code":"E1","name":"No matching data","branchFrom":4,"steps":["System displays the message \"No matching data found\""]}],"businessRules":["Filters can be combined with the search box","There is an ''All categories'' option"],"screenIds":[],"assumptions":[]},{"code":"UC-05","name":"Discontinue a product","actors":["Administrator"],"storyCodes":["US-05"],"description":"Administrator wants to discontinue a product so that customers cannot order discontinued items.","trigger":"Administrator selects the \"Discontinue a product\" function","preconditions":["Administrator is signed in and has permission to use the function"],"postconditions":["Goal achieved: customers cannot order discontinued items"],"mainFlow":[{"no":1,"actor":"Administrator","text":"Selects the \"Discontinue a product\" function"},{"no":2,"actor":"System","text":"Displays the corresponding screen / form"},{"no":3,"actor":"Administrator","text":"Enters or selects the required information and confirms"},{"no":4,"actor":"System","text":"Validates the data against the business rules"},{"no":5,"actor":"System","text":"Saves the result and shows a success message"}],"altFlows":[{"code":"A1","name":"User cancels the operation","branchFrom":3,"steps":["Administrator selects Cancel","System closes the screen without saving changes"]}],"exceptions":[{"code":"E1","name":"Invalid data","branchFrom":4,"steps":["System shows an error on the invalid field","Return to step 3"]},{"code":"E2","name":"System error while saving","branchFrom":5,"steps":["System reports that saving failed and keeps the entered data"]}],"businessRules":["Ask for confirmation before discontinuing","Discontinued products are not shown on the website"],"screenIds":[],"assumptions":[]}]}', 'approved', 0, 1, 'demo-mem-duc', '2026-10-21T02:15:54.270Z');
INSERT INTO "module_docs" ("module_id", "kind", "content", "data", "status", "revision_requested", "rev", "updated_by", "updated_at") VALUES ('demo-mod-products', 'SRS', '# SRS – Product Management

## 1. Introduction

### 1.1 Purpose
Software requirements specification for module **Product Management**, serving as the basis for design, development and testing.
### 1.2 Scope
- UC-01 – Search products by name or SKU
- UC-02 – Add a new product with name, SKU, category, price and stock
- UC-03 – Edit the price and stock of a product
- UC-04 – Filter products by category and status
- UC-05 – Discontinue a product
### 1.3 References
- Module BRD
- Module UC Specification

## 2. Overall Description

### 2.1 Actors
| Actor | Use case |
|---|---|
| Administrator | UC-01, UC-02, UC-03, UC-04, UC-05 |
### 2.2 General Constraints
- Every function requires the user to be signed in with the appropriate permissions.
- The user interface and messages are displayed in English.

## 3. Functional Requirements

### UC-01 – Search products by name or SKU
Administrator wants to search products by name or SKU so that I can check stock before restocking.
- **Actors:** Administrator
- **Inputs:** Selects the "Search products by name or SKU" function; Enters or selects the search criteria
- **Processing:** Displays the data list and the filter fields; Filters and displays the matching results
- **Outputs:** Goal achieved: I can check stock before restocking
- **Rule:** Search matches part of the name, case-insensitive
- **Rule:** When there are no results, show the message ''No products found''
- **Rule:** Results are paginated at 20 rows per page
- **Exception E1:** No matching data
### UC-02 – Add a new product with name, SKU, category, price and stock
Administrator wants to add a new product with name, SKU, category, price and stock so that the product can go on sale on the website.
- **Actors:** Administrator
- **Inputs:** Selects the "Add a new product with name, SKU, category, price and stock" function; Enters or selects the required information and confirms
- **Processing:** Displays the corresponding screen / form; Validates the data against the business rules; Saves the result and shows a success message
- **Outputs:** Goal achieved: the product can go on sale on the website
- **Rule:** Product name is required, up to 100 characters
- **Rule:** SKU must be unique
- **Rule:** Price must be greater than 0
- **Exception E1:** Invalid data
- **Exception E2:** System error while saving
### UC-03 – Edit the price and stock of a product
Administrator wants to edit the price and stock of a product so that the information on the website is always correct.
- **Actors:** Administrator
- **Inputs:** Selects the "Edit the price and stock of a product" function; Enters or selects the required information and confirms
- **Processing:** Displays the corresponding screen / form; Validates the data against the business rules; Saves the result and shows a success message
- **Outputs:** Goal achieved: the information on the website is always correct
- **Rule:** On successful save, show a confirmation and refresh the list
- **Rule:** Stock cannot be negative
- **Exception E1:** Invalid data
- **Exception E2:** System error while saving
### UC-04 – Filter products by category and status
Administrator wants to filter products by category and status so that I can review prices for each product group.
- **Actors:** Administrator
- **Inputs:** Selects the "Filter products by category and status" function; Enters or selects the search criteria
- **Processing:** Displays the data list and the filter fields; Filters and displays the matching results
- **Outputs:** Goal achieved: I can review prices for each product group
- **Rule:** Filters can be combined with the search box
- **Rule:** There is an ''All categories'' option
- **Exception E1:** No matching data
### UC-05 – Discontinue a product
Administrator wants to discontinue a product so that customers cannot order discontinued items.
- **Actors:** Administrator
- **Inputs:** Selects the "Discontinue a product" function; Enters or selects the required information and confirms
- **Processing:** Displays the corresponding screen / form; Validates the data against the business rules; Saves the result and shows a success message
- **Outputs:** Goal achieved: customers cannot order discontinued items
- **Rule:** Ask for confirmation before discontinuing
- **Rule:** Discontinued products are not shown on the website
- **Exception E1:** Invalid data
- **Exception E2:** System error while saving

## 4. Non-functional Requirements

- Performance: main operations respond within 2 seconds with 100 concurrent users (Assumption – to be confirmed).
- Security: user authentication and role-based access control for every function (Assumption – to be confirmed).
- Audit: record who performed each data-changing operation and when (Assumption – to be confirmed).
- Availability: 99.5% uptime during business hours (Assumption – to be confirmed).

## 5. User Interfaces

| Use case | Proposed screen | Main actions |
|---|---|---|
| UC-01 | Search products by name or SKU | Selects the "Search products by name or SKU" function; Enters or selects the search criteria |
| UC-02 | Add a new product with name, SKU, category, price and stock | Selects the "Add a new product with name, SKU, category, price and stock" function; Enters or selects the required information and confirms |
| UC-03 | Edit the price and stock of a product | Selects the "Edit the price and stock of a product" function; Enters or selects the required information and confirms |
| UC-04 | Filter products by category and status | Selects the "Filter products by category and status" function; Enters or selects the search criteria |
| UC-05 | Discontinue a product | Selects the "Discontinue a product" function; Enters or selects the required information and confirms |

## 6. Data Requirements

| Data | Description | Use case |
|---|---|---|
| Search products by name or SKU information | Data created/read in UC-01 | UC-01 |
| Add a new product with name, SKU, category, price and stock information | Data created/read in UC-02 | UC-02 |
| Edit the price and stock of a product information | Data created/read in UC-03 | UC-03 |
| Filter products by category and status information | Data created/read in UC-04 | UC-04 |
| Discontinue a product information | Data created/read in UC-05 | UC-05 |

## 7. Assumptions and Open Issues

- Field-level details will be clarified once the screen design (prototype) is available.
', '{"srs":{"sections":[{"key":"intro","title":"1. Introduction","content":"### 1.1 Purpose\nSoftware requirements specification for module **Product Management**, serving as the basis for design, development and testing.\n### 1.2 Scope\n- UC-01 – Search products by name or SKU\n- UC-02 – Add a new product with name, SKU, category, price and stock\n- UC-03 – Edit the price and stock of a product\n- UC-04 – Filter products by category and status\n- UC-05 – Discontinue a product\n### 1.3 References\n- Module BRD\n- Module UC Specification"},{"key":"overview","title":"2. Overall Description","content":"### 2.1 Actors\n| Actor | Use case |\n|---|---|\n| Administrator | UC-01, UC-02, UC-03, UC-04, UC-05 |\n### 2.2 General Constraints\n- Every function requires the user to be signed in with the appropriate permissions.\n- The user interface and messages are displayed in English."},{"key":"functional","title":"3. Functional Requirements","content":"### UC-01 – Search products by name or SKU\nAdministrator wants to search products by name or SKU so that I can check stock before restocking.\n- **Actors:** Administrator\n- **Inputs:** Selects the \"Search products by name or SKU\" function; Enters or selects the search criteria\n- **Processing:** Displays the data list and the filter fields; Filters and displays the matching results\n- **Outputs:** Goal achieved: I can check stock before restocking\n- **Rule:** Search matches part of the name, case-insensitive\n- **Rule:** When there are no results, show the message ''No products found''\n- **Rule:** Results are paginated at 20 rows per page\n- **Exception E1:** No matching data\n### UC-02 – Add a new product with name, SKU, category, price and stock\nAdministrator wants to add a new product with name, SKU, category, price and stock so that the product can go on sale on the website.\n- **Actors:** Administrator\n- **Inputs:** Selects the \"Add a new product with name, SKU, category, price and stock\" function; Enters or selects the required information and confirms\n- **Processing:** Displays the corresponding screen / form; Validates the data against the business rules; Saves the result and shows a success message\n- **Outputs:** Goal achieved: the product can go on sale on the website\n- **Rule:** Product name is required, up to 100 characters\n- **Rule:** SKU must be unique\n- **Rule:** Price must be greater than 0\n- **Exception E1:** Invalid data\n- **Exception E2:** System error while saving\n### UC-03 – Edit the price and stock of a product\nAdministrator wants to edit the price and stock of a product so that the information on the website is always correct.\n- **Actors:** Administrator\n- **Inputs:** Selects the \"Edit the price and stock of a product\" function; Enters or selects the required information and confirms\n- **Processing:** Displays the corresponding screen / form; Validates the data against the business rules; Saves the result and shows a success message\n- **Outputs:** Goal achieved: the information on the website is always correct\n- **Rule:** On successful save, show a confirmation and refresh the list\n- **Rule:** Stock cannot be negative\n- **Exception E1:** Invalid data\n- **Exception E2:** System error while saving\n### UC-04 – Filter products by category and status\nAdministrator wants to filter products by category and status so that I can review prices for each product group.\n- **Actors:** Administrator\n- **Inputs:** Selects the \"Filter products by category and status\" function; Enters or selects the search criteria\n- **Processing:** Displays the data list and the filter fields; Filters and displays the matching results\n- **Outputs:** Goal achieved: I can review prices for each product group\n- **Rule:** Filters can be combined with the search box\n- **Rule:** There is an ''All categories'' option\n- **Exception E1:** No matching data\n### UC-05 – Discontinue a product\nAdministrator wants to discontinue a product so that customers cannot order discontinued items.\n- **Actors:** Administrator\n- **Inputs:** Selects the \"Discontinue a product\" function; Enters or selects the required information and confirms\n- **Processing:** Displays the corresponding screen / form; Validates the data against the business rules; Saves the result and shows a success message\n- **Outputs:** Goal achieved: customers cannot order discontinued items\n- **Rule:** Ask for confirmation before discontinuing\n- **Rule:** Discontinued products are not shown on the website\n- **Exception E1:** Invalid data\n- **Exception E2:** System error while saving"},{"key":"nonfunctional","title":"4. Non-functional Requirements","content":"- Performance: main operations respond within 2 seconds with 100 concurrent users (Assumption – to be confirmed).\n- Security: user authentication and role-based access control for every function (Assumption – to be confirmed).\n- Audit: record who performed each data-changing operation and when (Assumption – to be confirmed).\n- Availability: 99.5% uptime during business hours (Assumption – to be confirmed)."},{"key":"interfaces","title":"5. User Interfaces","content":"| Use case | Proposed screen | Main actions |\n|---|---|---|\n| UC-01 | Search products by name or SKU | Selects the \"Search products by name or SKU\" function; Enters or selects the search criteria |\n| UC-02 | Add a new product with name, SKU, category, price and stock | Selects the \"Add a new product with name, SKU, category, price and stock\" function; Enters or selects the required information and confirms |\n| UC-03 | Edit the price and stock of a product | Selects the \"Edit the price and stock of a product\" function; Enters or selects the required information and confirms |\n| UC-04 | Filter products by category and status | Selects the \"Filter products by category and status\" function; Enters or selects the search criteria |\n| UC-05 | Discontinue a product | Selects the \"Discontinue a product\" function; Enters or selects the required information and confirms |"},{"key":"data","title":"6. Data Requirements","content":"| Data | Description | Use case |\n|---|---|---|\n| Search products by name or SKU information | Data created/read in UC-01 | UC-01 |\n| Add a new product with name, SKU, category, price and stock information | Data created/read in UC-02 | UC-02 |\n| Edit the price and stock of a product information | Data created/read in UC-03 | UC-03 |\n| Filter products by category and status information | Data created/read in UC-04 | UC-04 |\n| Discontinue a product information | Data created/read in UC-05 | UC-05 |"},{"key":"assumptions","title":"7. Assumptions and Open Issues","content":"- Field-level details will be clarified once the screen design (prototype) is available."}]}}', 'done', 0, 1, 'demo-mem-anh', '2026-10-21T02:15:54.287Z');
INSERT INTO "module_docs" ("module_id", "kind", "content", "data", "status", "revision_requested", "rev", "updated_by", "updated_at") VALUES ('demo-mod-products', 'FRD_NFR', '# FRD-NFR – Product Management

## Functional Requirements (FR)

| ID | Requirement | Priority | Use case | Source |
|---|---|---|---|---|
| FR-01 | The system shall allow Administrator to search products by name or SKU. | High | UC-01 | UC-01 main flow |
| FR-02 | The system shall ensure that: Search matches part of the name, case-insensitive. | Medium | UC-01 | UC-01 business rule |
| FR-03 | The system shall ensure that: When there are no results, show the message ''No products found''. | Medium | UC-01 | UC-01 business rule |
| FR-04 | The system shall ensure that: Results are paginated at 20 rows per page. | Medium | UC-01 | UC-01 business rule |
| FR-05 | The system shall allow Administrator to add a new product with name, SKU, category, price and stock. | High | UC-02 | UC-02 main flow |
| FR-06 | The system shall ensure that: Product name is required, up to 100 characters. | Medium | UC-02 | UC-02 business rule |
| FR-07 | The system shall ensure that: SKU must be unique. | Medium | UC-02 | UC-02 business rule |
| FR-08 | The system shall ensure that: Price must be greater than 0. | Medium | UC-02 | UC-02 business rule |
| FR-09 | The system shall validate the input data of "Add a new product with name, SKU, category, price and stock" and show a clear error on each invalid field. | Medium | UC-02 | UC-02 E1 |
| FR-10 | The system shall allow Administrator to edit the price and stock of a product. | Medium | UC-03 | UC-03 main flow |
| FR-11 | The system shall ensure that: On successful save, show a confirmation and refresh the list. | Medium | UC-03 | UC-03 business rule |
| FR-12 | The system shall ensure that: Stock cannot be negative. | Medium | UC-03 | UC-03 business rule |
| FR-13 | The system shall validate the input data of "Edit the price and stock of a product" and show a clear error on each invalid field. | Medium | UC-03 | UC-03 E1 |
| FR-14 | The system shall allow Administrator to filter products by category and status. | Medium | UC-04 | UC-04 main flow |
| FR-15 | The system shall ensure that: Filters can be combined with the search box. | Medium | UC-04 | UC-04 business rule |
| FR-16 | The system shall ensure that: There is an ''All categories'' option. | Medium | UC-04 | UC-04 business rule |
| FR-17 | The system shall allow Administrator to discontinue a product. | Low | UC-05 | UC-05 main flow |
| FR-18 | The system shall ensure that: Ask for confirmation before discontinuing. | Medium | UC-05 | UC-05 business rule |
| FR-19 | The system shall ensure that: Discontinued products are not shown on the website. | Medium | UC-05 | UC-05 business rule |
| FR-20 | The system shall validate the input data of "Discontinue a product" and show a clear error on each invalid field. | Medium | UC-05 | UC-05 E1 |

## Non-functional Requirements (NFR)

| ID | Requirement | Priority | Use case | Source |
|---|---|---|---|---|
| NFR-01 | Main operations shall respond within 2 seconds with 100 concurrent users. _(assumption)_ | Medium | UC-01, UC-02, UC-03, UC-04, UC-05 | SRS section 4 – default suggestion |
| NFR-02 | Every function shall require authentication and role-based authorisation. _(assumption)_ | High | UC-01, UC-02, UC-03, UC-04, UC-05 | SRS section 4 – default suggestion |
| NFR-03 | The system shall log who performed each data-changing operation and when. _(assumption)_ | Medium | UC-01, UC-02, UC-03, UC-04, UC-05 | SRS section 4 – default suggestion |
| NFR-04 | The system shall be available 99.5% of the time during business hours. _(assumption)_ | Low | UC-01, UC-02, UC-03, UC-04, UC-05 | SRS section 4 – default suggestion |
', '{"requirements":[{"code":"FR-01","type":"FR","statement":"The system shall allow Administrator to search products by name or SKU.","priority":"High","useCaseCodes":["UC-01"],"source":"UC-01 main flow","isAssumption":false},{"code":"FR-02","type":"FR","statement":"The system shall ensure that: Search matches part of the name, case-insensitive.","priority":"Medium","useCaseCodes":["UC-01"],"source":"UC-01 business rule","isAssumption":false},{"code":"FR-03","type":"FR","statement":"The system shall ensure that: When there are no results, show the message ''No products found''.","priority":"Medium","useCaseCodes":["UC-01"],"source":"UC-01 business rule","isAssumption":false},{"code":"FR-04","type":"FR","statement":"The system shall ensure that: Results are paginated at 20 rows per page.","priority":"Medium","useCaseCodes":["UC-01"],"source":"UC-01 business rule","isAssumption":false},{"code":"FR-05","type":"FR","statement":"The system shall allow Administrator to add a new product with name, SKU, category, price and stock.","priority":"High","useCaseCodes":["UC-02"],"source":"UC-02 main flow","isAssumption":false},{"code":"FR-06","type":"FR","statement":"The system shall ensure that: Product name is required, up to 100 characters.","priority":"Medium","useCaseCodes":["UC-02"],"source":"UC-02 business rule","isAssumption":false},{"code":"FR-07","type":"FR","statement":"The system shall ensure that: SKU must be unique.","priority":"Medium","useCaseCodes":["UC-02"],"source":"UC-02 business rule","isAssumption":false},{"code":"FR-08","type":"FR","statement":"The system shall ensure that: Price must be greater than 0.","priority":"Medium","useCaseCodes":["UC-02"],"source":"UC-02 business rule","isAssumption":false},{"code":"FR-09","type":"FR","statement":"The system shall validate the input data of \"Add a new product with name, SKU, category, price and stock\" and show a clear error on each invalid field.","priority":"Medium","useCaseCodes":["UC-02"],"source":"UC-02 E1","isAssumption":false},{"code":"FR-10","type":"FR","statement":"The system shall allow Administrator to edit the price and stock of a product.","priority":"Medium","useCaseCodes":["UC-03"],"source":"UC-03 main flow","isAssumption":false},{"code":"FR-11","type":"FR","statement":"The system shall ensure that: On successful save, show a confirmation and refresh the list.","priority":"Medium","useCaseCodes":["UC-03"],"source":"UC-03 business rule","isAssumption":false},{"code":"FR-12","type":"FR","statement":"The system shall ensure that: Stock cannot be negative.","priority":"Medium","useCaseCodes":["UC-03"],"source":"UC-03 business rule","isAssumption":false},{"code":"FR-13","type":"FR","statement":"The system shall validate the input data of \"Edit the price and stock of a product\" and show a clear error on each invalid field.","priority":"Medium","useCaseCodes":["UC-03"],"source":"UC-03 E1","isAssumption":false},{"code":"FR-14","type":"FR","statement":"The system shall allow Administrator to filter products by category and status.","priority":"Medium","useCaseCodes":["UC-04"],"source":"UC-04 main flow","isAssumption":false},{"code":"FR-15","type":"FR","statement":"The system shall ensure that: Filters can be combined with the search box.","priority":"Medium","useCaseCodes":["UC-04"],"source":"UC-04 business rule","isAssumption":false},{"code":"FR-16","type":"FR","statement":"The system shall ensure that: There is an ''All categories'' option.","priority":"Medium","useCaseCodes":["UC-04"],"source":"UC-04 business rule","isAssumption":false},{"code":"FR-17","type":"FR","statement":"The system shall allow Administrator to discontinue a product.","priority":"Low","useCaseCodes":["UC-05"],"source":"UC-05 main flow","isAssumption":false},{"code":"FR-18","type":"FR","statement":"The system shall ensure that: Ask for confirmation before discontinuing.","priority":"Medium","useCaseCodes":["UC-05"],"source":"UC-05 business rule","isAssumption":false},{"code":"FR-19","type":"FR","statement":"The system shall ensure that: Discontinued products are not shown on the website.","priority":"Medium","useCaseCodes":["UC-05"],"source":"UC-05 business rule","isAssumption":false},{"code":"FR-20","type":"FR","statement":"The system shall validate the input data of \"Discontinue a product\" and show a clear error on each invalid field.","priority":"Medium","useCaseCodes":["UC-05"],"source":"UC-05 E1","isAssumption":false},{"code":"NFR-01","type":"NFR","statement":"Main operations shall respond within 2 seconds with 100 concurrent users.","priority":"Medium","useCaseCodes":["UC-01","UC-02","UC-03","UC-04","UC-05"],"source":"SRS section 4 – default suggestion","isAssumption":true},{"code":"NFR-02","type":"NFR","statement":"Every function shall require authentication and role-based authorisation.","priority":"High","useCaseCodes":["UC-01","UC-02","UC-03","UC-04","UC-05"],"source":"SRS section 4 – default suggestion","isAssumption":true},{"code":"NFR-03","type":"NFR","statement":"The system shall log who performed each data-changing operation and when.","priority":"Medium","useCaseCodes":["UC-01","UC-02","UC-03","UC-04","UC-05"],"source":"SRS section 4 – default suggestion","isAssumption":true},{"code":"NFR-04","type":"NFR","statement":"The system shall be available 99.5% of the time during business hours.","priority":"Low","useCaseCodes":["UC-01","UC-02","UC-03","UC-04","UC-05"],"source":"SRS section 4 – default suggestion","isAssumption":true}]}', 'done', 0, 1, 'demo-mem-anh', '2026-10-21T02:15:54.300Z');
INSERT INTO "module_docs" ("module_id", "kind", "content", "data", "status", "revision_requested", "rev", "updated_by", "updated_at") VALUES ('demo-mod-products', 'API_SPEC', '# API Spec – Product Management

## General Conventions

- Base URL: `/api/v1` (Assumption – to be confirmed)
- Format: JSON, UTF-8 encoded; timestamps in ISO 8601.
- Authentication: Bearer token in the `Authorization` header (Assumption – to be confirmed).
- Errors are returned as `{ "code": "<ERROR_CODE>", "message": "<human-readable message>" }`.

## GET /api/v1/search-products-by-name-or

**Description:** Administrator wants to search products by name or SKU so that I can check stock before restocking.

**Use case:** UC-01 – Search products by name or SKU · **Requirements:** FR-01, FR-02, FR-03, FR-04

**Request (query)**

| Field | Type | Required | Description |
|---|---|---|---|
| keyword | string | No | Search keyword |
| page | number | No | Page (default 1) |
| pageSize | number | No | Rows per page (default 20) |

**Response 200**

| Field | Type | Description |
|---|---|---|
| items | array | Result list |
| total | number | Total number of records |

**Error codes**

| HTTP status | Error code | When |
|---|---|---|
| 404 | NOT_FOUND | E1 – No matching data |
| 401 | UNAUTHORIZED | Not signed in or the session has expired |
| 403 | FORBIDDEN | Not permitted to perform the action |

## POST /api/v1/add-a-new-product-with

**Description:** Administrator wants to add a new product with name, SKU, category, price and stock so that the product can go on sale on the website.

**Use case:** UC-02 – Add a new product with name, SKU, category, price and stock · **Requirements:** FR-05, FR-06, FR-07, FR-08, FR-09

**Request (body)**

| Field | Type | Required | Description |
|---|---|---|---|
| amount | number | Yes | Amount (Assumption) |

**Response 201**

| Field | Type | Description |
|---|---|---|
| id | string | Record ID |
| updatedAt | string | Last updated time |

**Error codes**

| HTTP status | Error code | When |
|---|---|---|
| 400 | INVALID_INPUT | E1 – Invalid data |
| 500 | INTERNAL_ERROR | E2 – System error while saving |
| 401 | UNAUTHORIZED | Not signed in or the session has expired |
| 403 | FORBIDDEN | Not permitted to perform the action |

## PUT /api/v1/edit-the-price-and-stock/{id}

**Description:** Administrator wants to edit the price and stock of a product so that the information on the website is always correct.

**Use case:** UC-03 – Edit the price and stock of a product · **Requirements:** FR-10, FR-11, FR-12, FR-13

**Request (body)**

| Field | Type | Required | Description |
|---|---|---|---|
| id (path) | string | Yes | Record ID |
| amount | number | Yes | Amount (Assumption) |

**Response 200**

| Field | Type | Description |
|---|---|---|
| id | string | Record ID |
| updatedAt | string | Last updated time |

**Error codes**

| HTTP status | Error code | When |
|---|---|---|
| 400 | INVALID_INPUT | E1 – Invalid data |
| 500 | INTERNAL_ERROR | E2 – System error while saving |
| 401 | UNAUTHORIZED | Not signed in or the session has expired |
| 403 | FORBIDDEN | Not permitted to perform the action |

## GET /api/v1/filter-products-by-category-and

**Description:** Administrator wants to filter products by category and status so that I can review prices for each product group.

**Use case:** UC-04 – Filter products by category and status · **Requirements:** FR-14, FR-15, FR-16

**Request (query)**

| Field | Type | Required | Description |
|---|---|---|---|
| keyword | string | No | Search keyword |
| page | number | No | Page (default 1) |
| pageSize | number | No | Rows per page (default 20) |

**Response 200**

| Field | Type | Description |
|---|---|---|
| items | array | Result list |
| total | number | Total number of records |

**Error codes**

| HTTP status | Error code | When |
|---|---|---|
| 404 | NOT_FOUND | E1 – No matching data |
| 401 | UNAUTHORIZED | Not signed in or the session has expired |
| 403 | FORBIDDEN | Not permitted to perform the action |

## POST /api/v1/discontinue-a-product

**Description:** Administrator wants to discontinue a product so that customers cannot order discontinued items.

**Use case:** UC-05 – Discontinue a product · **Requirements:** FR-17, FR-18, FR-19, FR-20

**Request (body)**

| Field | Type | Required | Description |
|---|---|---|---|
| data | object | Yes | Discontinue a product details – field-level details to be added once the prototype exists (Assumption) |

**Response 201**

| Field | Type | Description |
|---|---|---|
| id | string | Record ID |
| updatedAt | string | Last updated time |

**Error codes**

| HTTP status | Error code | When |
|---|---|---|
| 400 | INVALID_INPUT | E1 – Invalid data |
| 500 | INTERNAL_ERROR | E2 – System error while saving |
| 401 | UNAUTHORIZED | Not signed in or the session has expired |
| 403 | FORBIDDEN | Not permitted to perform the action |
', NULL, 'draft', 1, 1, 'demo-mem-duc', '2026-10-21T02:15:54.314Z');

-- Bảng modules
CREATE TABLE modules (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL, requirement_input TEXT NOT NULL DEFAULT '',
  docs_status TEXT NOT NULL DEFAULT 'none', tests_status TEXT NOT NULL DEFAULT 'none', created_at TEXT NOT NULL
, qus_score INTEGER, qus_checked_at TEXT, tests_rev INTEGER NOT NULL DEFAULT 0, tests_revision_requested INTEGER NOT NULL DEFAULT 0, tests_updated_by TEXT REFERENCES members(id) ON DELETE SET NULL, tests_updated_at TEXT);
INSERT INTO "modules" ("id", "project_id", "name", "requirement_input", "docs_status", "tests_status", "created_at", "qus_score", "qus_checked_at", "tests_rev", "tests_revision_requested", "tests_updated_by", "tests_updated_at") VALUES ('demo-mod-products', 'demo-shop', 'Product Management', '', 'none', 'done', '2026-10-07T02:15:53.934Z', 100, '2026-10-21T02:15:54.161Z', 1, 0, 'demo-mem-anh', '2026-10-21T02:15:54.497Z');
INSERT INTO "modules" ("id", "project_id", "name", "requirement_input", "docs_status", "tests_status", "created_at", "qus_score", "qus_checked_at", "tests_rev", "tests_revision_requested", "tests_updated_by", "tests_updated_at") VALUES ('demo-mod-orders', 'demo-shop', 'Order Management', '', 'none', 'none', '2026-10-08T02:15:53.934Z', 96, '2026-10-21T02:15:54.165Z', 0, 0, NULL, NULL);

-- Bảng project_git
CREATE TABLE project_git (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  repo TEXT NOT NULL DEFAULT '',
  token TEXT NOT NULL DEFAULT '',
  branch TEXT NOT NULL DEFAULT 'main',
  updated_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL
);

-- Bảng projects
CREATE TABLE projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
INSERT INTO "projects" ("id", "name", "description", "created_at") VALUES ('4cc992f1-3854-484f-9b6d-a5f0ac10e0fe', 'test 2010', '', '2026-10-20T11:00:15.579Z');
INSERT INTO "projects" ("id", "name", "description", "created_at") VALUES ('2156e4fa-3d72-4847-82c9-e60f0e731b42', 'Test_demo_2010', 'ABC', '2026-10-20T16:15:08.967Z');
INSERT INTO "projects" ("id", "name", "description", "created_at") VALUES ('demo-shop', 'Electronics Store (sample)', 'Sample project for demos: an electronics e-commerce website – product and order management.', '2026-10-07T02:15:53.934Z');

-- Bảng prompt_runs
CREATE TABLE prompt_runs (
  id TEXT PRIMARY KEY, module_id TEXT, type TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
  input TEXT NOT NULL, output TEXT NOT NULL, ok INTEGER NOT NULL, error TEXT NOT NULL DEFAULT '',
  input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, latency_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
INSERT INTO "prompt_runs" ("id", "module_id", "type", "provider", "model", "input", "output", "ok", "error", "input_tokens", "output_tokens", "latency_ms", "created_at") VALUES ('d0b90088-ea94-4a7b-a389-37bf29c87827', 'demo-mod-products', 'generate_doc_brd', 'mock', 'rule-based', 'Write a BRD (Business Requirements Document) for module "Product Management" from the user stories below.
Start with the line "# BRD – Product Management". Required sections (use "## "):
## 1. Background and Objectives
## 2. Scope (### In Scope / ### Out of Scope)
## 3. Stakeholders (table | Stakeholder | Role | Related stories |)
## 4. Business Requirements (table | ID | Business requirement | Benefit | Priority | Story |, IDs BR-01, BR-02…)
## 5. Acceptance Criteria (### per story, bullet list)
## 6. Assumptions and Constraints

## Module user stories
- US-01 [High]: As a administrator, I want search products by name or SKU, so that I can check stock before restocking
    - AC: Search matches part of the name, case-insensitive
    - AC: When there are no results, show the message ''No products found''
    - AC: Results are paginated at 20 rows per page
- US-02 [High]: As a administrator, I want add a new product with name, SKU, category, price and stock, so that the product can go on sale on the website
    - AC: Product name is required, up to 100 characters
    - AC: SKU must be unique
    - AC: Price must be greater than 0
- US-03 [Medium]: As a administrator, I want edit the price and stock of a product, so that the information on the website is always correct
    - AC: On successful save, show a confirmation and refresh the list
    - AC: Stock cannot be negative
- US-04 [Medium]: As a administrator, I want filter products by category and status, so that I can review prices for each product group
    - AC: Filters can be combined with the search box
    - AC: There is an ''All categories'' option
- US-05 [Low]: As a administrator, I want discontinue a product, so that customers cannot order discontinued items
    - AC: Ask for confirmation before discontinuing
    - AC: Discontinued products are not shown on the website', '"# BRD – Product Management\n\n## 1. Background and Objectives\n\nModule **Product Management** is built to satisfy 5 user stories from: Administrator.\n\nBusiness objectives:\n- I can check stock before restocking (US-01)\n- The product can go on sale on the website (US-02)\n- The information on the website is always correct (US-03)\n- I can review prices for each product group (US-04)\n- Customers cannot order discontinued items (US-05)\n\n## 2. Scope\n\n### In Scope\n- Search products by name or SKU (US-01)\n- Add a new product with name, SKU, category, price and stock (US-02)\n- Edit the price and stock of a product (US-03)\n- Filter products by category and status (US-04)\n- Discontinue a product (US-05)\n\n### Out of Scope\n- Features not listed in the module''s user stories (any addition must be confirmed by the BA).\n- Integration with external systems that have not been described.\n\n## 3. Stakeholders\n\n| Stakeholder | Role | Related stories |\n|---|---|---|\n| Administrator | Direct user of the feature | US-01, US-02, US-03, US-04, US-05 |\n| BA Lead / Product Owner | Approves requirements and performs acceptance | All |\n\n## 4. Business Requirements\n\n| ID | Business requirement | Benefit | Priority | Story |\n|---|---|---|---|---|\n| BR-01 | Administrator can search products by name or SKU | I can check stock before restocking | High | US-01 |\n| BR-02 | Administrator can add a new product with name, SKU, category, price and stock | The product can go on sale on the website | High | US-02 |\n| BR-03 | Administrator can edit the price and stock of a product | The information on the website is always correct | Medium | US-03 |\n| BR-04 | Administrator can filter products by category and status | I can review prices for each product group | Medium | US-04 |\n| BR-05 | Administrator can discontinue a product | Customers cannot order discontinued items | Low | US-05 |\n\n## 5. Acceptance Criteria\n\n### US-01 – Search products by name or SKU\n- Search matches part of the name, case-insensitive\n- When there are no results, show the message ''No products found''\n- Results are paginated at 20 rows per page\n\n### US-02 – Add a new product with name, SKU, category, price and stock\n- Product name is required, up to 100 characters\n- SKU must be unique\n- Price must be greater than 0\n\n### US-03 – Edit the price and stock of a product\n- On successful save, show a confirmation and refresh the list\n- Stock cannot be negative\n\n### US-04 – Filter products by category and status\n- Filters can be combined with the search box\n- There is an ''All categories'' option\n\n### US-05 – Discontinue a product\n- Ask for confirmation before discontinuing\n- Discontinued products are not shown on the website\n\n## 6. Assumptions and Constraints\n\n- Users have been given an account and the appropriate permissions before using the feature.\n- Content is derived from the user stories; unclear points must be confirmed by the BA with the stakeholders.\n"', 1, '', 0, 0, 0, '2026-10-21T02:15:54.241Z');
INSERT INTO "prompt_runs" ("id", "module_id", "type", "provider", "model", "input", "output", "ok", "error", "input_tokens", "output_tokens", "latency_ms", "created_at") VALUES ('2418a1c1-135c-4c74-be44-ce1932845ec5', 'demo-mod-products', 'generate_doc_uc_spec', 'mock', 'rule-based', 'Write the use case specifications for module "Product Management" from the BRD and user stories below.
- Use case IDs: UC-01, UC-02…; each use case is one business goal of an actor (do not split per minor button).
- storyCodes: source user story IDs (only IDs from the list). Every story must belong to at least one use case.
- Main flow: each step names its actor (an actor name or "System"). Alternative flows use IDs A1, A2…; exception flows E1, E2… (branchFrom = the step they branch from).
- businessRules: taken from the acceptance criteria and business requirements. Anything inferred goes into assumptions.

## BRD
# BRD – Product Management

## 1. Background and Objectives

Module **Product Management** is built to satisfy 5 user stories from: Administrator.

Business objectives:
- I can check stock before restocking (US-01)
- The product can go on sale on the website (US-02)
- The information on the website is always correct (US-03)
- I can review prices for each product group (US-04)
- Customers cannot order discontinued items (US-05)

## 2. Scope

### In Scope
- Search products by name or SKU (US-01)
- Add a new product with name, SKU, category, price and stock (US-02)
- Edit the price and stock of a product (US-03)
- Filter products by category and status (US-04)
- Discontinue a product (US-05)

### Out of Scope
- Features not listed in the module''s user stories (any addition must be confirmed by the BA).
- Integration with external systems that have not been described.

## 3. Stakeholders

| Stakeholder | Role | Related stories |
|---|---|---|
| Administrator | Direct user of the feature | US-01, US-02, US-03, US-04, US-05 |
| BA Lead / Product Owner | Approves requirements and performs acceptance | All |

## 4. Business Requirements

| ID | Business requirement | Benefit | Priority | Story |
|---|---|---|---|---|
| BR-01 | Administrator can search products by name or SKU | I can check stock before restocking | High | US-01 |
| BR-02 | Administrator can add a new product with name, SKU, category, price and stock | The product can go on sale on the website | High | US-02 |
| BR-03 | Administrator can edit the price and stock of a product | The information on the website is always correct | Medium | US-03 |
| BR-04 | Administrator can filter products by category and status | I can review prices for each product group | Medium | US-04 |
| BR-05 | Administrator can discontinue a product | Customers cannot order discontinued items | Low | US-05 |

## 5. Acceptance Criteria

### US-01 – Search products by name or SKU
- Search matches part of the name, case-insensitive
- When there are no results, show the message ''No products found''
- Results are paginated at 20 rows per page

### US-02 – Add a new product with name, SKU, category, price and stock
- Product name is required, up to 100 characters
- SKU must be unique
- Price must be greater than 0

### US-03 – Edit the price and stock of a product
- On successful save, show a confirmation and refresh the list
- Stock cannot be negative

### US-04 – Filter products by category and status
- Filters can be combined with the search box
- There is an ''All categories'' option

### US-05 – Discontinue a product
- Ask for confirmation before discontinuing
- Discontinued products are not shown on the website

## 6. Assumptions and Constraints

- Users have been given an account and the appropriate permissions before using the feature.
- Content is derived from the user stories; unclear points must be confirmed by the BA with the stakeholders.


## User stories
- US-01 [High]: As a administrator, I want search products by name or SKU, so that I can check stock before restocking
    - AC: Search matches part of the name, case-insensitive
    - AC: When there are no results, show the message ''No products found''
    - AC: Results are paginated at 20 rows per page
- US-02 [High]: As a administrator, I want add a new product with name, SKU, category, price and stock, so that the product can go on sale on the website
    - AC: Product name is required, up to 100 characters
    - AC: SKU must be unique
    - AC: Price must be greater than 0
- US-03 [Medium]: As a administrator, I want edit the price and stock of a product, so that the information on the website is always correct
    - AC: On successful save, show a confirmation and refresh the list
    - AC: Stock cannot be negative
- US-04 [Medium]: As a administrator, I want filter products by category and status, so that I can review prices for each product group
    - AC: Filters can be combined with the search box
    - AC: There is an ''All categories'' option
- US-05 [Low]: As a administrator, I want discontinue a product, so that customers cannot order discontinued items
    - AC: Ask for confirmation before discontinuing
    - AC: Discontinued products are not shown on the website', '[{"code":"UC-01","name":"Search products by name or SKU","actors":["Administrator"],"storyCodes":["US-01"],"description":"Administrator wants to search products by name or SKU so that I can check stock before restocking.","trigger":"Administrator selects the \"Search products by name or SKU\" function","preconditions":["Administrator is signed in and has permission to use the function"],"postconditions":["Goal achieved: I can check stock before restocking"],"mainFlow":[{"no":1,"actor":"Administrator","text":"Selects the \"Search products by name or SKU\" function"},{"no":2,"actor":"System","text":"Displays the data list and the filter fields"},{"no":3,"actor":"Administrator","text":"Enters or selects the search criteria"},{"no":4,"actor":"System","text":"Filters and displays the matching results"}],"altFlows":[{"code":"A1","name":"User cancels the operation","branchFrom":3,"steps":["Administrator selects Cancel","System closes the screen without saving changes"]}],"exceptions":[{"code":"E1","name":"No matching data","branchFrom":4,"steps":["System displays the message \"No matching data found\""]}],"businessRules":["Search matches part of the name, case-insensitive","When there are no results, show the message ''No products found''","Results are paginated at 20 rows per page"],"screenIds":[],"assumptions":[]},{"code":"UC-02","name":"Add a new product with name, SKU, category, price and stock","actors":["Administrator"],"storyCodes":["US-02"],"description":"Administrator wants to add a new product with name, SKU, category, price and stock so that the product can go on sale on the website.","trigger":"Administrator selects the \"Add a new product with name, SKU, category, price and stock\" function","preconditions":["Administrator is signed in and has permission to use the function"],"postconditions":["Goal achieved: the product can go on sale on the website"],"mainFlow":[{"no":1,"actor":"Administrator","text":"Selects the \"Add a new product with name, SKU, category, price and stock\" function"},{"no":2,"actor":"System","text":"Displays the corresponding screen / form"},{"no":3,"actor":"Administrator","text":"Enters or selects the required information and confirms"},{"no":4,"actor":"System","text":"Validates the data against the business rules"},{"no":5,"actor":"System","text":"Saves the result and shows a success message"}],"altFlows":[{"code":"A1","name":"User cancels the operation","branchFrom":3,"steps":["Administrator selects Cancel","System closes the screen without saving changes"]}],"exceptions":[{"code":"E1","name":"Invalid data","branchFrom":4,"steps":["System shows an error on the invalid field","Return to step 3"]},{"code":"E2","name":"System error while saving","branchFrom":5,"steps":["System reports that saving failed and keeps the entered data"]}],"businessRules":["Product name is required, up to 100 characters","SKU must be unique","Price must be greater than 0"],"screenIds":[],"assumptions":[]},{"code":"UC-03","name":"Edit the price and stock of a product","actors":["Administrator"],"storyCodes":["US-03"],"description":"Administrator wants to edit the price and stock of a product so that the information on the website is always correct.","trigger":"Administrator selects the \"Edit the price and stock of a product\" function","preconditions":["Administrator is signed in and has permission to use the function"],"postconditions":["Goal achieved: the information on the website is always correct"],"mainFlow":[{"no":1,"actor":"Administrator","text":"Selects the \"Edit the price and stock of a product\" function"},{"no":2,"actor":"System","text":"Displays the corresponding screen / form"},{"no":3,"actor":"Administrator","text":"Enters or selects the required information and confirms"},{"no":4,"actor":"System","text":"Validates the data against the business rules"},{"no":5,"actor":"System","text":"Saves the result and shows a success message"}],"altFlows":[{"code":"A1","name":"User cancels the operation","branchFrom":3,"steps":["Administrator selects Cancel","System closes the screen without saving changes"]}],"exceptions":[{"code":"E1","name":"Invalid data","branchFrom":4,"steps":["System shows an error on the invalid field","Return to step 3"]},{"code":"E2","name":"System error while saving","branchFrom":5,"steps":["System reports that saving failed and keeps the entered data"]}],"businessRules":["On successful save, show a confirmation and refresh the list","Stock cannot be negative"],"screenIds":[],"assumptions":[]},{"code":"UC-04","name":"Filter products by category and status","actors":["Administrator"],"storyCodes":["US-04"],"description":"Administrator wants to filter products by category and status so that I can review prices for each product group.","trigger":"Administrator selects the \"Filter products by category and status\" function","preconditions":["Administrator is signed in and has permission to use the function"],"postconditions":["Goal achieved: I can review prices for each product group"],"mainFlow":[{"no":1,"actor":"Administrator","text":"Selects the \"Filter products by category and status\" function"},{"no":2,"actor":"System","text":"Displays the data list and the filter fields"},{"no":3,"actor":"Administrator","text":"Enters or selects the search criteria"},{"no":4,"actor":"System","text":"Filters and displays the matching results"}],"altFlows":[{"code":"A1","name":"User cancels the operation","branchFrom":3,"steps":["Administrator selects Cancel","System closes the screen without saving changes"]}],"exceptions":[{"code":"E1","name":"No matching data","branchFrom":4,"steps":["System displays the message \"No matching data found\""]}],"businessRules":["Filters can be combined with the search box","There is an ''All categories'' option"],"screenIds":[],"assumptions":[]},{"code":"UC-05","name":"Discontinue a product","actors":["Administrator"],"storyCodes":["US-05"],"description":"Administrator wants to discontinue a product so that customers cannot order discontinued items.","trigger":"Administrator selects the \"Discontinue a product\" function","preconditions":["Administrator is signed in and has permission to use the function"],"postconditions":["Goal achieved: customers cannot order discontinued items"],"mainFlow":[{"no":1,"actor":"Administrator","text":"Selects the \"Discontinue a product\" function"},{"no":2,"actor":"System","text":"Displays the corresponding screen / form"},{"no":3,"actor":"Administrator","text":"Enters or selects the required information and confirms"},{"no":4,"actor":"System","text":"Validates the data against the business rules"},{"no":5,"actor":"System","text":"Saves the result and shows a success message"}],"altFlows":[{"code":"A1","name":"User cancels the operation","branchFrom":3,"steps":["Administrator selects Cancel","System closes the screen without saving changes"]}],"exceptions":[{"code":"E1","name":"Invalid data","branchFrom":4,"steps":["System shows an error on the invalid field","Return to step 3"]},{"code":"E2","name":"System error while saving","branchFrom":5,"steps":["System reports that saving failed and keeps the entered data"]}],"businessRules":["Ask for confirmation before discontinuing","Discontinued products are not shown on the website"],"screenIds":[],"assumptions":[]}]', 1, '', 0, 0, 1, '2026-10-21T02:15:54.265Z');
INSERT INTO "prompt_runs" ("id", "module_id", "type", "provider", "model", "input", "output", "ok", "error", "input_tokens", "output_tokens", "latency_ms", "created_at") VALUES ('56aaa1eb-5a07-4ff4-8746-f485a666ea11', 'demo-mod-products', 'generate_doc_srs', 'mock', 'rule-based', 'Write an SRS following the ISO/IEC/IEEE 29148 structure for module "Product Management" from the UC Specification below.
Required sections (key – title):
- intro – 1. Introduction
- overview – 2. Overall Description
- functional – 3. Functional Requirements
- nonfunctional – 4. Non-functional Requirements
- interfaces – 5. User Interfaces
- data – 6. Data Requirements
- assumptions – 7. Assumptions and Open Issues
Each section''s content is Markdown (### sub-headings, bullet lists, tables); do NOT use "## " inside a section.
The functional section describes each use case (inputs, processing, outputs, rules). Any non-functional requirement you add must be marked "(Assumption – to be confirmed)".

## UC Specification
# UC Specification – Product Management

## UC-01 – Search products by name or SKU

**Actor:** Administrator

**Source stories:** US-01

**Description:** Administrator wants to search products by name or SKU so that I can check stock before restocking.

**Trigger:** Administrator selects the "Search products by name or SKU" function

**Preconditions:**
- Administrator is signed in and has permission to use the function

**Postconditions:**
- Goal achieved: I can check stock before restocking

**Main flow:**
1. Administrator: Selects the "Search products by name or SKU" function
2. System: Displays the data list and the filter fields
3. Administrator: Enters or selects the search criteria
4. System: Filters and displays the matching results

**A1 – User cancels the operation** (branches from step 3):
1. Administrator selects Cancel
2. System closes the screen without saving changes

**E1 – No matching data** (branches from step 4):
1. System displays the message "No matching data found"

**Business rules:**
- Search matches part of the name, case-insensitive
- When there are no results, show the message ''No products found''
- Results are paginated at 20 rows per page

## UC-02 – Add a new product with name, SKU, category, price and stock

**Actor:** Administrator

**Source stories:** US-02

**Description:** Administrator wants to add a new product with name, SKU, category, price and stock so that the product can go on sale on the website.

**Trigger:** Administrator selects the "Add a new product with name, SKU, category, price and stock" function

**Preconditions:**
- Administrator is signed in and has permission to use the function

**Postconditions:**
- Goal achieved: the product can go on sale on the website

**Main flow:**
1. Administrator: Selects the "Add a new product with name, SKU, category, price and stock" function
2. System: Displays the corresponding screen / form
3. Administrator: Enters or selects the required information and confirms
4. System: Validates the data against the business rules
5. System: Saves the result and shows a success message

**A1 – User cancels the operation** (branches from step 3):
1. Administrator selects Cancel
2. System closes the screen without saving changes

**E1 – Invalid data** (branches from step 4):
1. System shows an error on the invalid field
2. Return to step 3

**E2 – System error while saving** (branches from step 5):
1. System reports that saving failed and keeps the entered data

**Business rules:**
- Product name is required, up to 100 characters
- SKU must be unique
- Price must be greater than 0

## UC-03 – Edit the price and stock of a product

**Actor:** Administrator

**Source stories:** US-03

**Description:** Administrator wants to edit the price and stock of a product so that the information on the website is always correct.

**Trigger:** Administrator selects the "Edit the price and stock of a product" function

**Preconditions:**
- Administrator is signed in and has permission to use the function

**Postconditions:**
- Goal achieved: the information on the website is always correct

**Main flow:**
1. Administrator: Selects the "Edit the price and stock of a product" function
2. System: Displays the corresponding screen / form
3. Administrator: Enters or selects the required information and confirms
4. System: Validates the data against the business rules
5. System: Saves the result and shows a success message

**A1 – User cancels the operation** (branches from step 3):
1. Administrator selects Cancel
2. System closes the screen without saving changes

**E1 – Invalid data** (branches from step 4):
1. System shows an error on the invalid field
2. Return to step 3

**E2 – System error while saving** (branches from step 5):
1. System reports that saving failed and keeps the entered data

**Business rules:**
- On successful save, show a confirmation and refresh the list
- Stock cannot be negative

## UC-04 – Filter products by category and status

**Actor:** Administrator

**Source stories:** US-04

**Description:** Administrator wants to filter products by category and status so that I can review prices for each product group.

**Trigger:** Administrator selects the "Filter products by category and status" function

**Preconditions:**
- Administrator is signed in and has permission to use the function

**Postconditions:**
- Goal achieved: I can review prices for each product group

**Main flow:**
1. Administrator: Selects the "Filter products by category and status" function
2. System: Displays the data list and the filter fields
3. Administrator: Enters or selects the search criteria
4. System: Filters and displays the matching results

**A1 – User cancels the operation** (branches from step 3):
1. Administrator selects Cancel
2. System closes the screen without saving changes

**E1 – No matching data** (branches from step 4):
1. System displays the message "No matching data found"

**Business rules:**
- Filters can be combined with the search box
- There is an ''All categories'' option

## UC-05 – Discontinue a product

**Actor:** Administrator

**Source stories:** US-05

**Description:** Administrator wants to discontinue a product so that customers cannot order discontinued items.

**Trigger:** Administrator selects the "Discontinue a product" function

**Preconditions:**
- Administrator is signed in and has permission to use the function

**Postconditions:**
- Goal achieved: customers cannot order discontinued items

**Main flow:**
1. Administrator: Selects the "Discontinue a product" function
2. System: Displays the corresponding screen / form
3. Administrator: Enters or selects the required information and confirms
4. System: Validates the data against the business rules
5. System: Saves the result and shows a success message

**A1 – User cancels the operation** (branches from step 3):
1. Administrator selects Cancel
2. System closes the screen without saving changes

**E1 – Invalid data** (branches from step 4):
1. System shows an error on the invalid field
2. Return to step 3

**E2 – System error while saving** (branches from step 5):
1. System reports that saving failed and keeps the entered data

**Business rules:**
- Ask for confirmation before discontinuing
- Discontinued products are not shown on the website
', '{"sections":[{"key":"intro","title":"1. Introduction","content":"### 1.1 Purpose\nSoftware requirements specification for module **Product Management**, serving as the basis for design, development and testing.\n### 1.2 Scope\n- UC-01 – Search products by name or SKU\n- UC-02 – Add a new product with name, SKU, category, price and stock\n- UC-03 – Edit the price and stock of a product\n- UC-04 – Filter products by category and status\n- UC-05 – Discontinue a product\n### 1.3 References\n- Module BRD\n- Module UC Specification"},{"key":"overview","title":"2. Overall Description","content":"### 2.1 Actors\n| Actor | Use case |\n|---|---|\n| Administrator | UC-01, UC-02, UC-03, UC-04, UC-05 |\n### 2.2 General Constraints\n- Every function requires the user to be signed in with the appropriate permissions.\n- The user interface and messages are displayed in English."},{"key":"functional","title":"3. Functional Requirements","content":"### UC-01 – Search products by name or SKU\nAdministrator wants to search products by name or SKU so that I can check stock before restocking.\n- **Actors:** Administrator\n- **Inputs:** Selects the \"Search products by name or SKU\" function; Enters or selects the search criteria\n- **Processing:** Displays the data list and the filter fields; Filters and displays the matching results\n- **Outputs:** Goal achieved: I can check stock before restocking\n- **Rule:** Search matches part of the name, case-insensitive\n- **Rule:** When there are no results, show the message ''No products found''\n- **Rule:** Results are paginated at 20 rows per page\n- **Exception E1:** No matching data\n### UC-02 – Add a new product with name, SKU, category, price and stock\nAdministrator wants to add a new product with name, SKU, category, price and stock so that the product can go on sale on the website.\n- **Actors:** Administrator\n- **Inputs:** Selects the \"Add a new product with name, SKU, category, price and stock\" function; Enters or selects the required information and confirms\n- **Processing:** Displays the corresponding screen / form; Validates the data against the business rules; Saves the result and shows a success message\n- **Outputs:** Goal achieved: the product can go on sale on the website\n- **Rule:** Product name is required, up to 100 characters\n- **Rule:** SKU must be unique\n- **Rule:** Price must be greater than 0\n- **Exception E1:** Invalid data\n- **Exception E2:** System error while saving\n### UC-03 – Edit the price and stock of a product\nAdministrator wants to edit the price and stock of a product so that the information on the website is always correct.\n- **Actors:** Administrator\n- **Inputs:** Selects the \"Edit the price and stock of a product\" function; Enters or selects the required information and confirms\n- **Processing:** Displays the corresponding screen / form; Validates the data against the business rules; Saves the result and shows a success message\n- **Outputs:** Goal achieved: the information on the website is always correct\n- **Rule:** On successful save, show a confirmation and refresh the list\n- **Rule:** Stock cannot be negative\n- **Exception E1:** Invalid data\n- **Exception E2:** System error while saving\n### UC-04 – Filter products by category and status\nAdministrator wants to filter products by category and status so that I can review prices for each product group.\n- **Actors:** Administrator\n- **Inputs:** Selects the \"Filter products by category and status\" function; Enters or selects the search criteria\n- **Processing:** Displays the data list and the filter fields; Filters and displays the matching results\n- **Outputs:** Goal achieved: I can review prices for each product group\n- **Rule:** Filters can be combined with the search box\n- **Rule:** There is an ''All categories'' option\n- **Exception E1:** No matching data\n### UC-05 – Discontinue a product\nAdministrator wants to discontinue a product so that customers cannot order discontinued items.\n- **Actors:** Administrator\n- **Inputs:** Selects the \"Discontinue a product\" function; Enters or selects the required information and confirms\n- **Processing:** Displays the corresponding screen / form; Validates the data against the business rules; Saves the result and shows a success message\n- **Outputs:** Goal achieved: customers cannot order discontinued items\n- **Rule:** Ask for confirmation before discontinuing\n- **Rule:** Discontinued products are not shown on the website\n- **Exception E1:** Invalid data\n- **Exception E2:** System error while saving"},{"key":"nonfunctional","title":"4. Non-functional Requirements","content":"- Performance: main operations respond within 2 seconds with 100 concurrent users (Assumption – to be confirmed).\n- Security: user authentication and role-based access control for every function (Assumption – to be confirmed).\n- Audit: record who performed each data-changing operation and when (Assumption – to be confirmed).\n- Availability: 99.5% uptime during business hours (Assumption – to be confirmed)."},{"key":"interfaces","title":"5. User Interfaces","content":"| Use case | Proposed screen | Main actions |\n|---|---|---|\n| UC-01 | Search products by name or SKU | Selects the \"Search products by name or SKU\" function; Enters or selects the search criteria |\n| UC-02 | Add a new product with name, SKU, category, price and stock | Selects the \"Add a new product with name, SKU, category, price and stock\" function; Enters or selects the required information and confirms |\n| UC-03 | Edit the price and stock of a product | Selects the \"Edit the price and stock of a product\" function; Enters or selects the required information and confirms |\n| UC-04 | Filter products by category and status | Selects the \"Filter products by category and status\" function; Enters or selects the search criteria |\n| UC-05 | Discontinue a product | Selects the \"Discontinue a product\" function; Enters or selects the required information and confirms |"},{"key":"data","title":"6. Data Requirements","content":"| Data | Description | Use case |\n|---|---|---|\n| Search products by name or SKU information | Data created/read in UC-01 | UC-01 |\n| Add a new product with name, SKU, category, price and stock information | Data created/read in UC-02 | UC-02 |\n| Edit the price and stock of a product information | Data created/read in UC-03 | UC-03 |\n| Filter products by category and status information | Data created/read in UC-04 | UC-04 |\n| Discontinue a product information | Data created/read in UC-05 | UC-05 |"},{"key":"assumptions","title":"7. Assumptions and Open Issues","content":"- Field-level details will be clarified once the screen design (prototype) is available."}]}', 1, '', 0, 0, 1, '2026-10-21T02:15:54.284Z');
INSERT INTO "prompt_runs" ("id", "module_id", "type", "provider", "model", "input", "output", "ok", "error", "input_tokens", "output_tokens", "latency_ms", "created_at") VALUES ('0b91d936-5906-4cce-873f-ea2c6d22ab70', 'demo-mod-products', 'generate_doc_frd_nfr', 'mock', 'rule-based', 'List the functional (FR) and non-functional (NFR) requirements for module "Product Management" from the SRS and use cases below.
- IDs FR-01…, NFR-01…; every use case has at least 1 FR; every important business rule becomes 1 validation FR.
- useCaseCodes may only use use case IDs from the list. Self-proposed NFRs have isAssumption = true.
- source: where the requirement comes from (e.g. "UC-01 main flow", "SRS section 4").

## SRS
# SRS – Product Management

## 1. Introduction

### 1.1 Purpose
Software requirements specification for module **Product Management**, serving as the basis for design, development and testing.
### 1.2 Scope
- UC-01 – Search products by name or SKU
- UC-02 – Add a new product with name, SKU, category, price and stock
- UC-03 – Edit the price and stock of a product
- UC-04 – Filter products by category and status
- UC-05 – Discontinue a product
### 1.3 References
- Module BRD
- Module UC Specification

## 2. Overall Description

### 2.1 Actors
| Actor | Use case |
|---|---|
| Administrator | UC-01, UC-02, UC-03, UC-04, UC-05 |
### 2.2 General Constraints
- Every function requires the user to be signed in with the appropriate permissions.
- The user interface and messages are displayed in English.

## 3. Functional Requirements

### UC-01 – Search products by name or SKU
Administrator wants to search products by name or SKU so that I can check stock before restocking.
- **Actors:** Administrator
- **Inputs:** Selects the "Search products by name or SKU" function; Enters or selects the search criteria
- **Processing:** Displays the data list and the filter fields; Filters and displays the matching results
- **Outputs:** Goal achieved: I can check stock before restocking
- **Rule:** Search matches part of the name, case-insensitive
- **Rule:** When there are no results, show the message ''No products found''
- **Rule:** Results are paginated at 20 rows per page
- **Exception E1:** No matching data
### UC-02 – Add a new product with name, SKU, category, price and stock
Administrator wants to add a new product with name, SKU, category, price and stock so that the product can go on sale on the website.
- **Actors:** Administrator
- **Inputs:** Selects the "Add a new product with name, SKU, category, price and stock" function; Enters or selects the required information and confirms
- **Processing:** Displays the corresponding screen / form; Validates the data against the business rules; Saves the result and shows a success message
- **Outputs:** Goal achieved: the product can go on sale on the website
- **Rule:** Product name is required, up to 100 characters
- **Rule:** SKU must be unique
- **Rule:** Price must be greater than 0
- **Exception E1:** Invalid data
- **Exception E2:** System error while saving
### UC-03 – Edit the price and stock of a product
Administrator wants to edit the price and stock of a product so that the information on the website is always correct.
- **Actors:** Administrator
- **Inputs:** Selects the "Edit the price and stock of a product" function; Enters or selects the required information and confirms
- **Processing:** Displays the corresponding screen / form; Validates the data against the business rules; Saves the result and shows a success message
- **Outputs:** Goal achieved: the information on the website is always correct
- **Rule:** On successful save, show a confirmation and refresh the list
- **Rule:** Stock cannot be negative
- **Exception E1:** Invalid data
- **Exception E2:** System error while saving
### UC-04 – Filter products by category and status
Administrator wants to filter products by category and status so that I can review prices for each product group.
- **Actors:** Administrator
- **Inputs:** Selects the "Filter products by category and status" function; Enters or selects the search criteria
- **Processing:** Displays the data list and the filter fields; Filters and displays the matching results
- **Outputs:** Goal achieved: I can review prices for each product group
- **Rule:** Filters can be combined with the search box
- **Rule:** There is an ''All categories'' option
- **Exception E1:** No matching data
### UC-05 – Discontinue a product
Administrator wants to discontinue a product so that customers cannot order discontinued items.
- **Actors:** Administrator
- **Inputs:** Selects the "Discontinue a product" function; Enters or selects the required information and confirms
- **Processing:** Displays the corresponding screen / form; Validates the data against the business rules; Saves the result and shows a success message
- **Outputs:** Goal achieved: customers cannot order discontinued items
- **Rule:** Ask for confirmation before discontinuing
- **Rule:** Discontinued products are not shown on the website
- **Exception E1:** Invalid data
- **Exception E2:** System error while saving

## 4. Non-functional Requirements

- Performance: main operations respond within 2 seconds with 100 concurrent users (Assumption – to be confirmed).
- Security: user authentication and role-based access control for every function (Assumption – to be confirmed).
- Audit: record who performed each data-changing operation and when (Assumption – to be confirmed).
- Availability: 99.5% uptime during business hours (Assumption – to be confirmed).

## 5. User Interfaces

| Use case | Proposed screen | Main actions |
|---|---|---|
| UC-01 | Search products by name or SKU | Selects the "Search products by name or SKU" function; Enters or selects the search criteria |
| UC-02 | Add a new product with name, SKU, category, price and stock | Selects the "Add a new product with name, SKU, category, price and stock" function; Enters or selects the required information and confirms |
| UC-03 | Edit the price and stock of a product | Selects the "Edit the price and stock of a product" function; Enters or selects the required information and confirms |
| UC-04 | Filter products by category and status | Selects the "Filter products by category and status" function; Enters or selects the search criteria |
| UC-05 | Discontinue a product | Selects the "Discontinue a product" function; Enters or selects the required information and confirms |

## 6. Data Requirements

| Data | Description | Use case |
|---|---|---|
| Search products by name or SKU information | Data created/read in UC-01 | UC-01 |
| Add a new product with name, SKU, category, price and stock information | Data created/read in UC-02 | UC-02 |
| Edit the price and stock of a product information | Data created/read in UC-03 | UC-03 |
| Filter products by category and status information | Data created/read in UC-04 | UC-04 |
| Discontinue a product information | Data created/read in UC-05 | UC-05 |

## 7. Assumptions and Open Issues

- Field-level details will be clarified once the screen design (prototype) is available.


## Use cases (ID – name)
- UC-01 – Search products by name or SKU
- UC-02 – Add a new product with name, SKU, category, price and stock
- UC-03 – Edit the price and stock of a product
- UC-04 – Filter products by category and status
- UC-05 – Discontinue a product', '[{"code":"FR-01","type":"FR","statement":"The system shall allow Administrator to search products by name or SKU.","priority":"High","useCaseCodes":["UC-01"],"source":"UC-01 main flow","isAssumption":false},{"code":"FR-02","type":"FR","statement":"The system shall ensure that: Search matches part of the name, case-insensitive.","priority":"Medium","useCaseCodes":["UC-01"],"source":"UC-01 business rule","isAssumption":false},{"code":"FR-03","type":"FR","statement":"The system shall ensure that: When there are no results, show the message ''No products found''.","priority":"Medium","useCaseCodes":["UC-01"],"source":"UC-01 business rule","isAssumption":false},{"code":"FR-04","type":"FR","statement":"The system shall ensure that: Results are paginated at 20 rows per page.","priority":"Medium","useCaseCodes":["UC-01"],"source":"UC-01 business rule","isAssumption":false},{"code":"FR-05","type":"FR","statement":"The system shall allow Administrator to add a new product with name, SKU, category, price and stock.","priority":"High","useCaseCodes":["UC-02"],"source":"UC-02 main flow","isAssumption":false},{"code":"FR-06","type":"FR","statement":"The system shall ensure that: Product name is required, up to 100 characters.","priority":"Medium","useCaseCodes":["UC-02"],"source":"UC-02 business rule","isAssumption":false},{"code":"FR-07","type":"FR","statement":"The system shall ensure that: SKU must be unique.","priority":"Medium","useCaseCodes":["UC-02"],"source":"UC-02 business rule","isAssumption":false},{"code":"FR-08","type":"FR","statement":"The system shall ensure that: Price must be greater than 0.","priority":"Medium","useCaseCodes":["UC-02"],"source":"UC-02 business rule","isAssumption":false},{"code":"FR-09","type":"FR","statement":"The system shall validate the input data of \"Add a new product with name, SKU, category, price and stock\" and show a clear error on each invalid field.","priority":"Medium","useCaseCodes":["UC-02"],"source":"UC-02 E1","isAssumption":false},{"code":"FR-10","type":"FR","statement":"The system shall allow Administrator to edit the price and stock of a product.","priority":"Medium","useCaseCodes":["UC-03"],"source":"UC-03 main flow","isAssumption":false},{"code":"FR-11","type":"FR","statement":"The system shall ensure that: On successful save, show a confirmation and refresh the list.","priority":"Medium","useCaseCodes":["UC-03"],"source":"UC-03 business rule","isAssumption":false},{"code":"FR-12","type":"FR","statement":"The system shall ensure that: Stock cannot be negative.","priority":"Medium","useCaseCodes":["UC-03"],"source":"UC-03 business rule","isAssumption":false},{"code":"FR-13","type":"FR","statement":"The system shall validate the input data of \"Edit the price and stock of a product\" and show a clear error on each invalid field.","priority":"Medium","useCaseCodes":["UC-03"],"source":"UC-03 E1","isAssumption":false},{"code":"FR-14","type":"FR","statement":"The system shall allow Administrator to filter products by category and status.","priority":"Medium","useCaseCodes":["UC-04"],"source":"UC-04 main flow","isAssumption":false},{"code":"FR-15","type":"FR","statement":"The system shall ensure that: Filters can be combined with the search box.","priority":"Medium","useCaseCodes":["UC-04"],"source":"UC-04 business rule","isAssumption":false},{"code":"FR-16","type":"FR","statement":"The system shall ensure that: There is an ''All categories'' option.","priority":"Medium","useCaseCodes":["UC-04"],"source":"UC-04 business rule","isAssumption":false},{"code":"FR-17","type":"FR","statement":"The system shall allow Administrator to discontinue a product.","priority":"Low","useCaseCodes":["UC-05"],"source":"UC-05 main flow","isAssumption":false},{"code":"FR-18","type":"FR","statement":"The system shall ensure that: Ask for confirmation before discontinuing.","priority":"Medium","useCaseCodes":["UC-05"],"source":"UC-05 business rule","isAssumption":false},{"code":"FR-19","type":"FR","statement":"The system shall ensure that: Discontinued products are not shown on the website.","priority":"Medium","useCaseCodes":["UC-05"],"source":"UC-05 business rule","isAssumption":false},{"code":"FR-20","type":"FR","statement":"The system shall validate the input data of \"Discontinue a product\" and show a clear error on each invalid field.","priority":"Medium","useCaseCodes":["UC-05"],"source":"UC-05 E1","isAssumption":false},{"code":"NFR-01","type":"NFR","statement":"Main operations shall respond within 2 seconds with 100 concurrent users.","priority":"Medium","useCaseCodes":["UC-01","UC-02","UC-03","UC-04","UC-05"],"source":"SRS section 4 – default suggestion","isAssumption":true},{"code":"NFR-02","type":"NFR","statement":"Every function shall require authentication and role-based authorisation.","priority":"High","useCaseCodes":["UC-01","UC-02","UC-03","UC-04","UC-05"],"source":"SRS section 4 – default suggestion","isAssumption":true},{"code":"NFR-03","type":"NFR","statement":"The system shall log who performed each data-changing operation and when.","priority":"Medium","useCaseCodes":["UC-01","UC-02","UC-03","UC-04","UC-05"],"source":"SRS section 4 – default suggestion","isAssumption":true},{"code":"NFR-04","type":"NFR","statement":"The system shall be available 99.5% of the time during business hours.","priority":"Low","useCaseCodes":["UC-01","UC-02","UC-03","UC-04","UC-05"],"source":"SRS section 4 – default suggestion","isAssumption":true}]', 1, '', 0, 0, 0, '2026-10-21T02:15:54.297Z');
INSERT INTO "prompt_runs" ("id", "module_id", "type", "provider", "model", "input", "output", "ok", "error", "input_tokens", "output_tokens", "latency_ms", "created_at") VALUES ('6e4920d5-2705-47cc-9e39-c8c20b04eed3', 'demo-mod-products', 'generate_doc_api_spec', 'mock', 'rule-based', 'Write the API specification (REST, JSON) for module "Product Management" from the FRD-NFR and use cases below.
Start with "# API Spec – Product Management"; the first section is "## General Conventions" (base URL, authentication, error format).
One section per endpoint "## <METHOD> <path>" containing: description, related use case and FRs, a Request table (| Field | Type | Required | Description |),
a Response table (| Field | Type | Description |), an Error codes table (| HTTP status | Error code | When |). Do not use code blocks; mark anything inferred with "(Assumption)".

## FRD-NFR
# FRD-NFR – Product Management

## Functional Requirements (FR)

| ID | Requirement | Priority | Use case | Source |
|---|---|---|---|---|
| FR-01 | The system shall allow Administrator to search products by name or SKU. | High | UC-01 | UC-01 main flow |
| FR-02 | The system shall ensure that: Search matches part of the name, case-insensitive. | Medium | UC-01 | UC-01 business rule |
| FR-03 | The system shall ensure that: When there are no results, show the message ''No products found''. | Medium | UC-01 | UC-01 business rule |
| FR-04 | The system shall ensure that: Results are paginated at 20 rows per page. | Medium | UC-01 | UC-01 business rule |
| FR-05 | The system shall allow Administrator to add a new product with name, SKU, category, price and stock. | High | UC-02 | UC-02 main flow |
| FR-06 | The system shall ensure that: Product name is required, up to 100 characters. | Medium | UC-02 | UC-02 business rule |
| FR-07 | The system shall ensure that: SKU must be unique. | Medium | UC-02 | UC-02 business rule |
| FR-08 | The system shall ensure that: Price must be greater than 0. | Medium | UC-02 | UC-02 business rule |
| FR-09 | The system shall validate the input data of "Add a new product with name, SKU, category, price and stock" and show a clear error on each invalid field. | Medium | UC-02 | UC-02 E1 |
| FR-10 | The system shall allow Administrator to edit the price and stock of a product. | Medium | UC-03 | UC-03 main flow |
| FR-11 | The system shall ensure that: On successful save, show a confirmation and refresh the list. | Medium | UC-03 | UC-03 business rule |
| FR-12 | The system shall ensure that: Stock cannot be negative. | Medium | UC-03 | UC-03 business rule |
| FR-13 | The system shall validate the input data of "Edit the price and stock of a product" and show a clear error on each invalid field. | Medium | UC-03 | UC-03 E1 |
| FR-14 | The system shall allow Administrator to filter products by category and status. | Medium | UC-04 | UC-04 main flow |
| FR-15 | The system shall ensure that: Filters can be combined with the search box. | Medium | UC-04 | UC-04 business rule |
| FR-16 | The system shall ensure that: There is an ''All categories'' option. | Medium | UC-04 | UC-04 business rule |
| FR-17 | The system shall allow Administrator to discontinue a product. | Low | UC-05 | UC-05 main flow |
| FR-18 | The system shall ensure that: Ask for confirmation before discontinuing. | Medium | UC-05 | UC-05 business rule |
| FR-19 | The system shall ensure that: Discontinued products are not shown on the website. | Medium | UC-05 | UC-05 business rule |
| FR-20 | The system shall validate the input data of "Discontinue a product" and show a clear error on each invalid field. | Medium | UC-05 | UC-05 E1 |

## Non-functional Requirements (NFR)

| ID | Requirement | Priority | Use case | Source |
|---|---|---|---|---|
| NFR-01 | Main operations shall respond within 2 seconds with 100 concurrent users. _(assumption)_ | Medium | UC-01, UC-02, UC-03, UC-04, UC-05 | SRS section 4 – default suggestion |
| NFR-02 | Every function shall require authentication and role-based authorisation. _(assumption)_ | High | UC-01, UC-02, UC-03, UC-04, UC-05 | SRS section 4 – default suggestion |
| NFR-03 | The system shall log who performed each data-changing operation and when. _(assumption)_ | Medium | UC-01, UC-02, UC-03, UC-04, UC-05 | SRS section 4 – default suggestion |
| NFR-04 | The system shall be available 99.5% of the time during business hours. _(assumption)_ | Low | UC-01, UC-02, UC-03, UC-04, UC-05 | SRS section 4 – default suggestion |


## UC Specification
# UC Specification – Product Management

## UC-01 – Search products by name or SKU

**Actor:** Administrator

**Source stories:** US-01

**Description:** Administrator wants to search products by name or SKU so that I can check stock before restocking.

**Trigger:** Administrator selects the "Search products by name or SKU" function

**Preconditions:**
- Administrator is signed in and has permission to use the function

**Postconditions:**
- Goal achieved: I can check stock before restocking

**Main flow:**
1. Administrator: Selects the "Search products by name or SKU" function
2. System: Displays the data list and the filter fields
3. Administrator: Enters or selects the search criteria
4. System: Filters and displays the matching results

**A1 – User cancels the operation** (branches from step 3):
1. Administrator selects Cancel
2. System closes the screen without saving changes

**E1 – No matching data** (branches from step 4):
1. System displays the message "No matching data found"

**Business rules:**
- Search matches part of the name, case-insensitive
- When there are no results, show the message ''No products found''
- Results are paginated at 20 rows per page

## UC-02 – Add a new product with name, SKU, category, price and stock

**Actor:** Administrator

**Source stories:** US-02

**Description:** Administrator wants to add a new product with name, SKU, category, price and stock so that the product can go on sale on the website.

**Trigger:** Administrator selects the "Add a new product with name, SKU, category, price and stock" function

**Preconditions:**
- Administrator is signed in and has permission to use the function

**Postconditions:**
- Goal achieved: the product can go on sale on the website

**Main flow:**
1. Administrator: Selects the "Add a new product with name, SKU, category, price and stock" function
2. System: Displays the corresponding screen / form
3. Administrator: Enters or selects the required information and confirms
4. System: Validates the data against the business rules
5. System: Saves the result and shows a success message

**A1 – User cancels the operation** (branches from step 3):
1. Administrator selects Cancel
2. System closes the screen without saving changes

**E1 – Invalid data** (branches from step 4):
1. System shows an error on the invalid field
2. Return to step 3

**E2 – System error while saving** (branches from step 5):
1. System reports that saving failed and keeps the entered data

**Business rules:**
- Product name is required, up to 100 characters
- SKU must be unique
- Price must be greater than 0

## UC-03 – Edit the price and stock of a product

**Actor:** Administrator

**Source stories:** US-03

**Description:** Administrator wants to edit the price and stock of a product so that the information on the website is always correct.

**Trigger:** Administrator selects the "Edit the price and stock of a product" function

**Preconditions:**
- Administrator is signed in and has permission to use the function

**Postconditions:**
- Goal achieved: the information on the website is always correct

**Main flow:**
1. Administrator: Selects the "Edit the price and stock of a product" function
2. System: Displays the corresponding screen / form
3. Administrator: Enters or selects the required information and confirms
4. System: Validates the data against the business rules
5. System: Saves the result and shows a success message

**A1 – User cancels the operation** (branches from step 3):
1. Administrator selects Cancel
2. System closes the screen without saving changes

**E1 – Invalid data** (branches from step 4):
1. System shows an error on the invalid field
2. Return to step 3

**E2 – System error while saving** (branches from step 5):
1. System reports that saving failed and keeps the entered data

**Business rules:**
- On successful save, show a confirmation and refresh the list
- Stock cannot be negative

## UC-04 – Filter products by category and status

**Actor:** Administrator

**Source stories:** US-04

**Description:** Administrator wants to filter products by category and status so that I can review prices for each product group.

**Trigger:** Administrator selects the "Filter products by category and status" function

**Preconditions:**
- Administrator is signed in and has permission to use the function

**Postconditions:**
- Goal achieved: I can review prices for each product group

**Main flow:**
1. Administrator: Selects the "Filter products by category and status" function
2. System: Displays the data list and the filter fields
3. Administrator: Enters or selects the search criteria
4. System: Filters and displays the matching results

**A1 – User cancels the operation** (branches from step 3):
1. Administrator selects Cancel
2. System closes the screen without saving changes

**E1 – No matching data** (branches from step 4):
1. System displays the message "No matching data found"

**Business rules:**
- Filters can be combined with the search box
- There is an ''All categories'' option

## UC-05 – Discontinue a product

**Actor:** Administrator

**Source stories:** US-05

**Description:** Administrator wants to discontinue a product so that customers cannot order discontinued items.

**Trigger:** Administrator selects the "Discontinue a product" function

**Preconditions:**
- Administrator is signed in and has permission to use the function

**Postconditions:**
- Goal achieved: customers cannot order discontinued items

**Main flow:**
1. Administrator: Selects the "Discontinue a product" function
2. System: Displays the corresponding screen / form
3. Administrator: Enters or selects the required information and confirms
4. System: Validates the data against the business rules
5. System: Saves the result and shows a success message

**A1 – User cancels the operation** (branches from step 3):
1. Administrator selects Cancel
2. System closes the screen without saving changes

**E1 – Invalid data** (branches from step 4):
1. System shows an error on the invalid field
2. Return to step 3

**E2 – System error while saving** (branches from step 5):
1. System reports that saving failed and keeps the entered data

**Business rules:**
- Ask for confirmation before discontinuing
- Discontinued products are not shown on the website
', '"# API Spec – Product Management\n\n## General Conventions\n\n- Base URL: `/api/v1` (Assumption – to be confirmed)\n- Format: JSON, UTF-8 encoded; timestamps in ISO 8601.\n- Authentication: Bearer token in the `Authorization` header (Assumption – to be confirmed).\n- Errors are returned as `{ \"code\": \"<ERROR_CODE>\", \"message\": \"<human-readable message>\" }`.\n\n## GET /api/v1/search-products-by-name-or\n\n**Description:** Administrator wants to search products by name or SKU so that I can check stock before restocking.\n\n**Use case:** UC-01 – Search products by name or SKU · **Requirements:** FR-01, FR-02, FR-03, FR-04\n\n**Request (query)**\n\n| Field | Type | Required | Description |\n|---|---|---|---|\n| keyword | string | No | Search keyword |\n| page | number | No | Page (default 1) |\n| pageSize | number | No | Rows per page (default 20) |\n\n**Response 200**\n\n| Field | Type | Description |\n|---|---|---|\n| items | array | Result list |\n| total | number | Total number of records |\n\n**Error codes**\n\n| HTTP status | Error code | When |\n|---|---|---|\n| 404 | NOT_FOUND | E1 – No matching data |\n| 401 | UNAUTHORIZED | Not signed in or the session has expired |\n| 403 | FORBIDDEN | Not permitted to perform the action |\n\n## POST /api/v1/add-a-new-product-with\n\n**Description:** Administrator wants to add a new product with name, SKU, category, price and stock so that the product can go on sale on the website.\n\n**Use case:** UC-02 – Add a new product with name, SKU, category, price and stock · **Requirements:** FR-05, FR-06, FR-07, FR-08, FR-09\n\n**Request (body)**\n\n| Field | Type | Required | Description |\n|---|---|---|---|\n| amount | number | Yes | Amount (Assumption) |\n\n**Response 201**\n\n| Field | Type | Description |\n|---|---|---|\n| id | string | Record ID |\n| updatedAt | string | Last updated time |\n\n**Error codes**\n\n| HTTP status | Error code | When |\n|---|---|---|\n| 400 | INVALID_INPUT | E1 – Invalid data |\n| 500 | INTERNAL_ERROR | E2 – System error while saving |\n| 401 | UNAUTHORIZED | Not signed in or the session has expired |\n| 403 | FORBIDDEN | Not permitted to perform the action |\n\n## PUT /api/v1/edit-the-price-and-stock/{id}\n\n**Description:** Administrator wants to edit the price and stock of a product so that the information on the website is always correct.\n\n**Use case:** UC-03 – Edit the price and stock of a product · **Requirements:** FR-10, FR-11, FR-12, FR-13\n\n**Request (body)**\n\n| Field | Type | Required | Description |\n|---|---|---|---|\n| id (path) | string | Yes | Record ID |\n| amount | number | Yes | Amount (Assumption) |\n\n**Response 200**\n\n| Field | Type | Description |\n|---|---|---|\n| id | string | Record ID |\n| updatedAt | string | Last updated time |\n\n**Error codes**\n\n| HTTP status | Error code | When |\n|---|---|---|\n| 400 | INVALID_INPUT | E1 – Invalid data |\n| 500 | INTERNAL_ERROR | E2 – System error while saving |\n| 401 | UNAUTHORIZED | Not signed in or the session has expired |\n| 403 | FORBIDDEN | Not permitted to perform the action |\n\n## GET /api/v1/filter-products-by-category-and\n\n**Description:** Administrator wants to filter products by category and status so that I can review prices for each product group.\n\n**Use case:** UC-04 – Filter products by category and status · **Requirements:** FR-14, FR-15, FR-16\n\n**Request (query)**\n\n| Field | Type | Required | Description |\n|---|---|---|---|\n| keyword | string | No | Search keyword |\n| page | number | No | Page (default 1) |\n| pageSize | number | No | Rows per page (default 20) |\n\n**Response 200**\n\n| Field | Type | Description |\n|---|---|---|\n| items | array | Result list |\n| total | number | Total number of records |\n\n**Error codes**\n\n| HTTP status | Error code | When |\n|---|---|---|\n| 404 | NOT_FOUND | E1 – No matching data |\n| 401 | UNAUTHORIZED | Not signed in or the session has expired |\n| 403 | FORBIDDEN | Not permitted to perform the action |\n\n## POST /api/v1/discontinue-a-product\n\n**Description:** Administrator wants to discontinue a product so that customers cannot order discontinued items.\n\n**Use case:** UC-05 – Discontinue a product · **Requirements:** FR-17, FR-18, FR-19, FR-20\n\n**Request (body)**\n\n| Field | Type | Required | Description |\n|---|---|---|---|\n| data | object | Yes | Discontinue a product details – field-level details to be added once the prototype exists (Assumption) |\n\n**Response 201**\n\n| Field | Type | Description |\n|---|---|---|\n| id | string | Record ID |\n| updatedAt | string | Last updated time |\n\n**Error codes**\n\n| HTTP status | Error code | When |\n|---|---|---|\n| 400 | INVALID_INPUT | E1 – Invalid data |\n| 500 | INTERNAL_ERROR | E2 – System error while saving |\n| 401 | UNAUTHORIZED | Not signed in or the session has expired |\n| 403 | FORBIDDEN | Not permitted to perform the action |\n"', 1, '', 0, 0, 1, '2026-10-21T02:15:54.311Z');
INSERT INTO "prompt_runs" ("id", "module_id", "type", "provider", "model", "input", "output", "ok", "error", "input_tokens", "output_tokens", "latency_ms", "created_at") VALUES ('7cf23e70-6294-4fec-aa05-b17066b4ad12', 'demo-mod-products', 'generate_diagram_context', 'mock', 'rule-based', 'Build the context diagram for system/module "Product Management" (project "Electronics Store (sample)").
- system: name of the system in the centre.
- externals: actors (kind "actor": people, organisations) and external systems (kind "system") that interact with the system.
- flows: data flows between the system and each external party; from/to is a name from externals or "SYSTEM" (the system in the centre). Every external party has at least 1 flow.

## BRD
# BRD – Product Management

## 1. Background and Objectives

Module **Product Management** is built to satisfy 5 user stories from: Administrator.

Business objectives:
- I can check stock before restocking (US-01)
- The product can go on sale on the website (US-02)
- The information on the website is always correct (US-03)
- I can review prices for each product group (US-04)
- Customers cannot order discontinued items (US-05)

## 2. Scope

### In Scope
- Search products by name or SKU (US-01)
- Add a new product with name, SKU, category, price and stock (US-02)
- Edit the price and stock of a product (US-03)
- Filter products by category and status (US-04)
- Discontinue a product (US-05)

### Out of Scope
- Features not listed in the module''s user stories (any addition must be confirmed by the BA).
- Integration with external systems that have not been described.

## 3. Stakeholders

| Stakeholder | Role | Related stories |
|---|---|---|
| Administrator | Direct user of the feature | US-01, US-02, US-03, US-04, US-05 |
| BA Lead / Product Owner | Approves requirements and performs acceptance | All |

## 4. Business Requirements

| ID | Business requirement | Benefit | Priority | Story |
|---|---|---|---|---|
| BR-01 | Administrator can search products by name or SKU | I can check stock before restocking | High | US-01 |
| BR-02 | Administrator can add a new product with name, SKU, category, price and stock | The product can go on sale on the website | High | US-02 |
| BR-03 | Administrator can edit the price and stock of a product | The information on the website is always correct | Medium | US-03 |
| BR-04 | Administrator can filter products by category and status | I can review prices for each product group | Medium | US-04 |
| BR-05 | Administrator can discontinue a product | Customers cannot order discontinued items | Low | US-05 |

## 5. Acceptance Criteria

### US-01 – Search products by name or SKU
- Search matches part of the name, case-insensitive
- When there are no results, show the message ''No products found''
- Results are paginated at 20 rows per page

### US-02 – Add a new product with name, SKU, category, price and stock
- Product name is required, up to 100 characters
- SKU must be unique
- Price must be greater than 0

### US-03 – Edit the price and stock of a product
- On successful save, show a confirmation and refresh the list
- Stock cannot be negative

### US-04 – Filter products by category and status
- Filters can be combined with the search box
- There is an ''All categories'' option

### US-05 – Discontinue a product
- Ask for confirmation before discontinuing
- Discontinued products are not shown on the website

## 6. Assumptions and Constraints

- Users have been given an account and the appropriate permissions before using the feature.
- Content is derived from the user stories; unclear points must be confirmed by the BA with the stakeholders.


## User stories
- US-01: As a administrator, I want search products by name or SKU, so that I can check stock before restocking
- US-02: As a administrator, I want add a new product with name, SKU, category, price and stock, so that the product can go on sale on the website
- US-03: As a administrator, I want edit the price and stock of a product, so that the information on the website is always correct
- US-04: As a administrator, I want filter products by category and status, so that I can review prices for each product group
- US-05: As a administrator, I want discontinue a product, so that customers cannot order discontinued items', '{"code":"flowchart LR\n  %% diagram: CONTEXT – system in the centre, actors (rounded rectangles), external systems (double boxes)\n  SYS((\"Product Management\"))\n  ACT1(\"Administrator\")\n  ACT2(\"BA Lead / Product Owner\")\n  ACT1 -->|\"search products by name or SKU\"| SYS\n  SYS -->|\"Results, notifications\"| ACT1\n  ACT2 -->|\"Requests, input data\"| SYS\n  SYS -->|\"Results, notifications\"| ACT2","parts":[]}', 1, '', 0, 0, 4, '2026-10-21T02:15:54.328Z');
INSERT INTO "prompt_runs" ("id", "module_id", "type", "provider", "model", "input", "output", "ok", "error", "input_tokens", "output_tokens", "latency_ms", "created_at") VALUES ('c5912933-f737-457b-a2b4-4f4d20653ec3', 'demo-mod-products', 'generate_diagram_uc', 'mock', 'rule-based', 'Build the use case diagram for module "Product Management" from the use cases below.
- actors: actors outside the system (do not list "System").
- relations: relationships between use cases, using only use case IDs from the list. "include": from is the base use case, to is the use case that is always invoked. "extend": from is the extending use case (only happens under specific conditions), to is the base use case.
- If no relationship is clear, return an empty relations list.

## Use cases
[{"code":"UC-01","name":"Search products by name or SKU","actors":["Administrator"],"mainFlow":["Administrator: Selects the \"Search products by name or SKU\" function","System: Displays the data list and the filter fields","Administrator: Enters or selects the search criteria","System: Filters and displays the matching results"],"altFlows":["User cancels the operation"],"exceptions":[{"name":"No matching data","steps":["System displays the message \"No matching data found\""]}]},{"code":"UC-02","name":"Add a new product with name, SKU, category, price and stock","actors":["Administrator"],"mainFlow":["Administrator: Selects the \"Add a new product with name, SKU, category, price and stock\" function","System: Displays the corresponding screen / form","Administrator: Enters or selects the required information and confirms","System: Validates the data against the business rules","System: Saves the result and shows a success message"],"altFlows":["User cancels the operation"],"exceptions":[{"name":"Invalid data","steps":["System shows an error on the invalid field","Return to step 3"]},{"name":"System error while saving","steps":["System reports that saving failed and keeps the entered data"]}]},{"code":"UC-03","name":"Edit the price and stock of a product","actors":["Administrator"],"mainFlow":["Administrator: Selects the \"Edit the price and stock of a product\" function","System: Displays the corresponding screen / form","Administrator: Enters or selects the required information and confirms","System: Validates the data against the business rules","System: Saves the result and shows a success message"],"altFlows":["User cancels the operation"],"exceptions":[{"name":"Invalid data","steps":["System shows an error on the invalid field","Return to step 3"]},{"name":"System error while saving","steps":["System reports that saving failed and keeps the entered data"]}]},{"code":"UC-04","name":"Filter products by category and status","actors":["Administrator"],"mainFlow":["Administrator: Selects the \"Filter products by category and status\" function","System: Displays the data list and the filter fields","Administrator: Enters or selects the search criteria","System: Filters and displays the matching results"],"altFlows":["User cancels the operation"],"exceptions":[{"name":"No matching data","steps":["System displays the message \"No matching data found\""]}]},{"code":"UC-05","name":"Discontinue a product","actors":["Administrator"],"mainFlow":["Administrator: Selects the \"Discontinue a product\" function","System: Displays the corresponding screen / form","Administrator: Enters or selects the required information and confirms","System: Validates the data against the business rules","System: Saves the result and shows a success message"],"altFlows":["User cancels the operation"],"exceptions":[{"name":"Invalid data","steps":["System shows an error on the invalid field","Return to step 3"]},{"name":"System error while saving","steps":["System reports that saving failed and keeps the entered data"]}]}]', '{"code":"flowchart LR\n  %% nguon-uc: b5fdf3c0\n  A1((\"Administrator\"))\n  subgraph SYS[\"System\"]\n    direction TB\n    UC1([\"UC-01: Search products by name or SKU\"])\n    UC2([\"UC-02: Add a new product with name, SKU, category, price and stock\"])\n    UC3([\"UC-03: Edit the price and stock of a product\"])\n    UC4([\"UC-04: Filter products by category and status\"])\n    UC5([\"UC-05: Discontinue a product\"])\n  end\n  A1 --- UC1\n  A1 --- UC2\n  A1 --- UC3\n  A1 --- UC4\n  A1 --- UC5","parts":[]}', 1, '', 0, 0, 1, '2026-10-21T02:15:54.340Z');
INSERT INTO "prompt_runs" ("id", "module_id", "type", "provider", "model", "input", "output", "ok", "error", "input_tokens", "output_tokens", "latency_ms", "created_at") VALUES ('c55305fd-5188-4e14-9d8c-8314e9561f1f', 'demo-mod-products', 'generate_diagram_sequence', 'mock', 'rule-based', 'Draw a sequence diagram for EACH use case below (one diagram per use case).
- participants: short ASCII id (e.g. A, UI, API, DB) + English label; human actors have actor = true. Usually actor → user interface (screen name) → API Server → Database.
- messages: the main flow in order; from/to are participant ids; reply = true for responses.
- alts: one branch per important exception (condition + messages).

## Use cases
[{"code":"UC-01","name":"Search products by name or SKU","actors":["Administrator"],"screens":[],"mainFlow":[{"no":1,"actor":"Administrator","text":"Selects the \"Search products by name or SKU\" function"},{"no":2,"actor":"System","text":"Displays the data list and the filter fields"},{"no":3,"actor":"Administrator","text":"Enters or selects the search criteria"},{"no":4,"actor":"System","text":"Filters and displays the matching results"}],"exceptions":[{"code":"E1","name":"No matching data","branchFrom":4,"steps":["System displays the message \"No matching data found\""]}]},{"code":"UC-02","name":"Add a new product with name, SKU, category, price and stock","actors":["Administrator"],"screens":[],"mainFlow":[{"no":1,"actor":"Administrator","text":"Selects the \"Add a new product with name, SKU, category, price and stock\" function"},{"no":2,"actor":"System","text":"Displays the corresponding screen / form"},{"no":3,"actor":"Administrator","text":"Enters or selects the required information and confirms"},{"no":4,"actor":"System","text":"Validates the data against the business rules"},{"no":5,"actor":"System","text":"Saves the result and shows a success message"}],"exceptions":[{"code":"E1","name":"Invalid data","branchFrom":4,"steps":["System shows an error on the invalid field","Return to step 3"]},{"code":"E2","name":"System error while saving","branchFrom":5,"steps":["System reports that saving failed and keeps the entered data"]}]},{"code":"UC-03","name":"Edit the price and stock of a product","actors":["Administrator"],"screens":[],"mainFlow":[{"no":1,"actor":"Administrator","text":"Selects the \"Edit the price and stock of a product\" function"},{"no":2,"actor":"System","text":"Displays the corresponding screen / form"},{"no":3,"actor":"Administrator","text":"Enters or selects the required information and confirms"},{"no":4,"actor":"System","text":"Validates the data against the business rules"},{"no":5,"actor":"System","text":"Saves the result and shows a success message"}],"exceptions":[{"code":"E1","name":"Invalid data","branchFrom":4,"steps":["System shows an error on the invalid field","Return to step 3"]},{"code":"E2","name":"System error while saving","branchFrom":5,"steps":["System reports that saving failed and keeps the entered data"]}]},{"code":"UC-04","name":"Filter products by category and status","actors":["Administrator"],"screens":[],"mainFlow":[{"no":1,"actor":"Administrator","text":"Selects the \"Filter products by category and status\" function"},{"no":2,"actor":"System","text":"Displays the data list and the filter fields"},{"no":3,"actor":"Administrator","text":"Enters or selects the search criteria"},{"no":4,"actor":"System","text":"Filters and displays the matching results"}],"exceptions":[{"code":"E1","name":"No matching data","branchFrom":4,"steps":["System displays the message \"No matching data found\""]}]},{"code":"UC-05","name":"Discontinue a product","actors":["Administrator"],"screens":[],"mainFlow":[{"no":1,"actor":"Administrator","text":"Selects the \"Discontinue a product\" function"},{"no":2,"actor":"System","text":"Displays the corresponding screen / form"},{"no":3,"actor":"Administrator","text":"Enters or selects the required information and confirms"},{"no":4,"actor":"System","text":"Validates the data against the business rules"},{"no":5,"actor":"System","text":"Saves the result and shows a success message"}],"exceptions":[{"code":"E1","name":"Invalid data","branchFrom":4,"steps":["System shows an error on the invalid field","Return to step 3"]},{"code":"E2","name":"System error while saving","branchFrom":5,"steps":["System reports that saving failed and keeps the entered data"]}]}]', '{"code":"","parts":[{"key":"UC-01","title":"UC-01 – Search products by name or SKU","code":"sequenceDiagram\n  autonumber\n  actor A as Administrator\n  participant UI as User interface\n  participant API as API Server\n  participant DB as Database\n  A->>UI: Selects the ''Search products by name or SKU'' function\n  API->>DB: Query / update data\n  DB-->>API: Result\n  API-->>UI: Response\n  UI-->>A: Displays the data list and the filter fields\n  A->>UI: Enters or selects the search criteria\n  API->>DB: Query / update data\n  DB-->>API: Result\n  API-->>UI: Response\n  UI-->>A: Filters and displays the matching results\n  alt No matching data\n    UI-->>A: System displays the message ''No matching data found''\n  end"},{"key":"UC-02","title":"UC-02 – Add a new product with name, SKU, category, price and stock","code":"sequenceDiagram\n  autonumber\n  actor A as Administrator\n  participant UI as User interface\n  participant API as API Server\n  participant DB as Database\n  A->>UI: Selects the ''Add a new product with name, SKU, category, price and stock'' function\n  UI-->>A: Displays the corresponding screen / form\n  A->>UI: Enters or selects the required information and confirms\n  UI->>API: Send request\n  API->>API: Validates the data against the business rules\n  API->>DB: Query / update data\n  DB-->>API: Result\n  API-->>UI: Response\n  UI-->>A: Saves the result and shows a success message\n  alt Invalid data\n    UI-->>A: System shows an error on the invalid field\n    UI-->>A: Return to step 3\n  else System error while saving\n    UI-->>A: System reports that saving failed and keeps the entered data\n  end"},{"key":"UC-03","title":"UC-03 – Edit the price and stock of a product","code":"sequenceDiagram\n  autonumber\n  actor A as Administrator\n  participant UI as User interface\n  participant API as API Server\n  participant DB as Database\n  A->>UI: Selects the ''Edit the price and stock of a product'' function\n  UI-->>A: Displays the corresponding screen / form\n  A->>UI: Enters or selects the required information and confirms\n  UI->>API: Send request\n  API->>API: Validates the data against the business rules\n  API->>DB: Query / update data\n  DB-->>API: Result\n  API-->>UI: Response\n  UI-->>A: Saves the result and shows a success message\n  alt Invalid data\n    UI-->>A: System shows an error on the invalid field\n    UI-->>A: Return to step 3\n  else System error while saving\n    UI-->>A: System reports that saving failed and keeps the entered data\n  end"},{"key":"UC-04","title":"UC-04 – Filter products by category and status","code":"sequenceDiagram\n  autonumber\n  actor A as Administrator\n  participant UI as User interface\n  participant API as API Server\n  participant DB as Database\n  A->>UI: Selects the ''Filter products by category and status'' function\n  API->>DB: Query / update data\n  DB-->>API: Result\n  API-->>UI: Response\n  UI-->>A: Displays the data list and the filter fields\n  A->>UI: Enters or selects the search criteria\n  API->>DB: Query / update data\n  DB-->>API: Result\n  API-->>UI: Response\n  UI-->>A: Filters and displays the matching results\n  alt No matching data\n    UI-->>A: System displays the message ''No matching data found''\n  end"},{"key":"UC-05","title":"UC-05 – Discontinue a product","code":"sequenceDiagram\n  autonumber\n  actor A as Administrator\n  participant UI as User interface\n  participant API as API Server\n  participant DB as Database\n  A->>UI: Selects the ''Discontinue a product'' function\n  UI-->>A: Displays the corresponding screen / form\n  A->>UI: Enters or selects the required information and confirms\n  UI->>API: Send request\n  API->>API: Validates the data against the business rules\n  API->>DB: Query / update data\n  DB-->>API: Result\n  API-->>UI: Response\n  UI-->>A: Saves the result and shows a success message\n  alt Invalid data\n    UI-->>A: System shows an error on the invalid field\n    UI-->>A: Return to step 3\n  else System error while saving\n    UI-->>A: System reports that saving failed and keeps the entered data\n  end"}]}', 1, '', 0, 0, 2, '2026-10-21T02:15:54.350Z');
INSERT INTO "prompt_runs" ("id", "module_id", "type", "provider", "model", "input", "output", "ok", "error", "input_tokens", "output_tokens", "latency_ms", "created_at") VALUES ('a8597c52-153e-4646-9815-61820f3ce33e', 'demo-mod-products', 'generate_diagram_bpmn', 'mock', 'rule-based', 'Build a BPMN-style business process diagram for module "Product Management" (it will be simulated with a Mermaid flowchart).
- lanes: one lane per actor, plus a "System" lane for automated system steps.
- nodes: short ASCII id, lane (lane name), type: "start" (exactly 1), "end" (at least 1), "task" (activity, label starts with a verb), "gateway" (decision, label is a question, e.g. "Valid?").
- edges: from/to are node ids; edges leaving a gateway have a label (e.g. "Yes", "No").
- Every node must be reachable from start; follow the business order in the BRD and the use cases.

## BRD
# BRD – Product Management

## 1. Background and Objectives

Module **Product Management** is built to satisfy 5 user stories from: Administrator.

Business objectives:
- I can check stock before restocking (US-01)
- The product can go on sale on the website (US-02)
- The information on the website is always correct (US-03)
- I can review prices for each product group (US-04)
- Customers cannot order discontinued items (US-05)

## 2. Scope

### In Scope
- Search products by name or SKU (US-01)
- Add a new product with name, SKU, category, price and stock (US-02)
- Edit the price and stock of a product (US-03)
- Filter products by category and status (US-04)
- Discontinue a product (US-05)

### Out of Scope
- Features not listed in the module''s user stories (any addition must be confirmed by the BA).
- Integration with external systems that have not been described.

## 3. Stakeholders

| Stakeholder | Role | Related stories |
|---|---|---|
| Administrator | Direct user of the feature | US-01, US-02, US-03, US-04, US-05 |
| BA Lead / Product Owner | Approves requirements and performs acceptance | All |

## 4. Business Requirements

| ID | Business requirement | Benefit | Priority | Story |
|---|---|---|---|---|
| BR-01 | Administrator can search products by name or SKU | I can check stock before restocking | High | US-01 |
| BR-02 | Administrator can add a new product with name, SKU, category, price and stock | The product can go on sale on the website | High | US-02 |
| BR-03 | Administrator can edit the price and stock of a product | The information on the website is always correct | Medium | US-03 |
| BR-04 | Administrator can filter products by category and status | I can review prices for each product group | Medium | US-04 |
| BR-05 | Administrator can discontinue a product | Customers cannot order discontinued items | Low | US-05 |

## 5. Acceptance Criteria

### US-01 – Search products by name or SKU
- Search matches part of the name, case-insensitive
- When there are no results, show the message ''No products found''
- Results are paginated at 20 rows per page

### US-02 – Add a new product with name, SKU, category, price and stock
- Product name is required, up to 100 characters
- SKU must be unique
- Price must be greater than 0

### US-03 – Edit the price and stock of a product
- On successful save, show a confirmation and refresh the list
- Stock cannot be negative

### US-04 – Filter products by category and status
- Filters can be combined with the search box
- There is an ''All categories'' option

### US-05 – Discontinue a product
- Ask for confirmation before discontinuing
- Discontinued products are not shown on the website

## 6. Assumptions and Constraints

- Users have been given an account and the appropriate permissions before using the feature.
- Content is derived from the user stories; unclear points must be confirmed by the BA with the stakeholders.


## Use cases
[{"code":"UC-01","name":"Search products by name or SKU","actors":["Administrator"],"mainFlow":["Administrator: Selects the \"Search products by name or SKU\" function","System: Displays the data list and the filter fields","Administrator: Enters or selects the search criteria","System: Filters and displays the matching results"],"altFlows":["User cancels the operation"],"exceptions":[{"name":"No matching data","steps":["System displays the message \"No matching data found\""]}]},{"code":"UC-02","name":"Add a new product with name, SKU, category, price and stock","actors":["Administrator"],"mainFlow":["Administrator: Selects the \"Add a new product with name, SKU, category, price and stock\" function","System: Displays the corresponding screen / form","Administrator: Enters or selects the required information and confirms","System: Validates the data against the business rules","System: Saves the result and shows a success message"],"altFlows":["User cancels the operation"],"exceptions":[{"name":"Invalid data","steps":["System shows an error on the invalid field","Return to step 3"]},{"name":"System error while saving","steps":["System reports that saving failed and keeps the entered data"]}]},{"code":"UC-03","name":"Edit the price and stock of a product","actors":["Administrator"],"mainFlow":["Administrator: Selects the \"Edit the price and stock of a product\" function","System: Displays the corresponding screen / form","Administrator: Enters or selects the required information and confirms","System: Validates the data against the business rules","System: Saves the result and shows a success message"],"altFlows":["User cancels the operation"],"exceptions":[{"name":"Invalid data","steps":["System shows an error on the invalid field","Return to step 3"]},{"name":"System error while saving","steps":["System reports that saving failed and keeps the entered data"]}]},{"code":"UC-04","name":"Filter products by category and status","actors":["Administrator"],"mainFlow":["Administrator: Selects the \"Filter products by category and status\" function","System: Displays the data list and the filter fields","Administrator: Enters or selects the search criteria","System: Filters and displays the matching results"],"altFlows":["User cancels the operation"],"exceptions":[{"name":"No matching data","steps":["System displays the message \"No matching data found\""]}]},{"code":"UC-05","name":"Discontinue a product","actors":["Administrator"],"mainFlow":["Administrator: Selects the \"Discontinue a product\" function","System: Displays the corresponding screen / form","Administrator: Enters or selects the required information and confirms","System: Validates the data against the business rules","System: Saves the result and shows a success message"],"altFlows":["User cancels the operation"],"exceptions":[{"name":"Invalid data","steps":["System shows an error on the invalid field","Return to step 3"]},{"name":"System error while saving","steps":["System reports that saving failed and keeps the entered data"]}]}]', '{"code":"flowchart LR\n  %% BPMN simulated with Mermaid: lane = subgraph, event = circle, task = rounded rectangle, gateway = diamond\n  subgraph L1[\"Administrator\"]\n    direction LR\n    N1((\"Start\"))\n    N2(\"Search products by name or SKU\")\n    N5(\"Add a new product with name, SKU, category, price and stock\")\n    N8(\"Edit the price and stock of a product\")\n    N11(\"Filter products by category and status\")\n    N14(\"Discontinue a product\")\n    N17(((\"End\")))\n  end\n  subgraph L2[\"System\"]\n    direction LR\n    N3(\"Displays the data list and the filter fields\")\n    N4{\"Valid?\"}\n    N6(\"Displays the corresponding screen / form\")\n    N7{\"Valid?\"}\n    N9(\"Displays the corresponding screen / form\")\n    N10{\"Valid?\"}\n    N12(\"Displays the data list and the filter fields\")\n    N13{\"Valid?\"}\n    N15(\"Displays the corresponding screen / form\")\n    N16{\"Valid?\"}\n  end\n  N1 --> N2\n  N2 --> N3\n  N3 --> N4\n  N4 -->|\"No – No matching data\"| N2\n  N4 -->|\"Yes\"| N5\n  N5 --> N6\n  N6 --> N7\n  N7 -->|\"No – Invalid data\"| N5\n  N7 -->|\"Yes\"| N8\n  N8 --> N9\n  N9 --> N10\n  N10 -->|\"No – Invalid data\"| N8\n  N10 -->|\"Yes\"| N11\n  N11 --> N12\n  N12 --> N13\n  N13 -->|\"No – No matching data\"| N11\n  N13 -->|\"Yes\"| N14\n  N14 --> N15\n  N15 --> N16\n  N16 -->|\"No – Invalid data\"| N14\n  N16 -->|\"Yes\"| N17","parts":[]}', 1, '', 0, 0, 1, '2026-10-21T02:15:54.359Z');
INSERT INTO "prompt_runs" ("id", "module_id", "type", "provider", "model", "input", "output", "ok", "error", "input_tokens", "output_tokens", "latency_ms", "created_at") VALUES ('a5fb4519-cc54-41fb-8768-9a1885d9b6df', 'demo-mod-products', 'generate_diagram_erd', 'mock', 'rule-based', 'Build the ERD (entity–relationship diagram) for module "Product Management".
- entities: name (English, e.g. "Order"), key attributes (ASCII snake_case name, type ∈ string|text|int|decimal|boolean|date|datetime|uuid, key PK/FK/UK when applicable, English comment). Each entity has exactly 1 PK.
- relations: from/to are entity names, cardinality ∈ "1-1" | "1-n" | "n-n" | "1-0..1", label is a short verb.
- Only include entities supported by the requirements; do not create technical tables (logs, sessions) unless the requirements mention them.

## FRD-NFR
- FR-01 (FR): The system shall allow Administrator to search products by name or SKU.
- FR-02 (FR): The system shall ensure that: Search matches part of the name, case-insensitive.
- FR-03 (FR): The system shall ensure that: When there are no results, show the message ''No products found''.
- FR-04 (FR): The system shall ensure that: Results are paginated at 20 rows per page.
- FR-05 (FR): The system shall allow Administrator to add a new product with name, SKU, category, price and stock.
- FR-06 (FR): The system shall ensure that: Product name is required, up to 100 characters.
- FR-07 (FR): The system shall ensure that: SKU must be unique.
- FR-08 (FR): The system shall ensure that: Price must be greater than 0.
- FR-09 (FR): The system shall validate the input data of "Add a new product with name, SKU, category, price and stock" and show a clear error on each invalid field.
- FR-10 (FR): The system shall allow Administrator to edit the price and stock of a product.
- FR-11 (FR): The system shall ensure that: On successful save, show a confirmation and refresh the list.
- FR-12 (FR): The system shall ensure that: Stock cannot be negative.
- FR-13 (FR): The system shall validate the input data of "Edit the price and stock of a product" and show a clear error on each invalid field.
- FR-14 (FR): The system shall allow Administrator to filter products by category and status.
- FR-15 (FR): The system shall ensure that: Filters can be combined with the search box.
- FR-16 (FR): The system shall ensure that: There is an ''All categories'' option.
- FR-17 (FR): The system shall allow Administrator to discontinue a product.
- FR-18 (FR): The system shall ensure that: Ask for confirmation before discontinuing.
- FR-19 (FR): The system shall ensure that: Discontinued products are not shown on the website.
- FR-20 (FR): The system shall validate the input data of "Discontinue a product" and show a clear error on each invalid field.
- NFR-01 (NFR): Main operations shall respond within 2 seconds with 100 concurrent users.
- NFR-02 (NFR): Every function shall require authentication and role-based authorisation.
- NFR-03 (NFR): The system shall log who performed each data-changing operation and when.
- NFR-04 (NFR): The system shall be available 99.5% of the time during business hours.

## SRS
# SRS – Product Management

## 1. Introduction

### 1.1 Purpose
Software requirements specification for module **Product Management**, serving as the basis for design, development and testing.
### 1.2 Scope
- UC-01 – Search products by name or SKU
- UC-02 – Add a new product with name, SKU, category, price and stock
- UC-03 – Edit the price and stock of a product
- UC-04 – Filter products by category and status
- UC-05 – Discontinue a product
### 1.3 References
- Module BRD
- Module UC Specification

## 2. Overall Description

### 2.1 Actors
| Actor | Use case |
|---|---|
| Administrator | UC-01, UC-02, UC-03, UC-04, UC-05 |
### 2.2 General Constraints
- Every function requires the user to be signed in with the appropriate permissions.
- The user interface and messages are displayed in English.

## 3. Functional Requirements

### UC-01 – Search products by name or SKU
Administrator wants to search products by name or SKU so that I can check stock before restocking.
- **Actors:** Administrator
- **Inputs:** Selects the "Search products by name or SKU" function; Enters or selects the search criteria
- **Processing:** Displays the data list and the filter fields; Filters and displays the matching results
- **Outputs:** Goal achieved: I can check stock before restocking
- **Rule:** Search matches part of the name, case-insensitive
- **Rule:** When there are no results, show the message ''No products found''
- **Rule:** Results are paginated at 20 rows per page
- **Exception E1:** No matching data
### UC-02 – Add a new product with name, SKU, category, price and stock
Administrator wants to add a new product with name, SKU, category, price and stock so that the product can go on sale on the website.
- **Actors:** Administrator
- **Inputs:** Selects the "Add a new product with name, SKU, category, price and stock" function; Enters or selects the required information and confirms
- **Processing:** Displays the corresponding screen / form; Validates the data against the business rules; Saves the result and shows a success message
- **Outputs:** Goal achieved: the product can go on sale on the website
- **Rule:** Product name is required, up to 100 characters
- **Rule:** SKU must be unique
- **Rule:** Price must be greater than 0
- **Exception E1:** Invalid data
- **Exception E2:** System error while saving
### UC-03 – Edit the price and stock of a product
Administrator wants to edit the price and stock of a product so that the information on the website is always correct.
- **Actors:** Administrator
- **Inputs:** Selects the "Edit the price and stock of a product" function; Enters or selects the required information and confirms
- **Processing:** Displays the corresponding screen / form; Validates the data against the business rules; Saves the result and shows a success message
- **Outputs:** Goal achieved: the information on the website is always correct
- **Rule:** On successful save, show a confirmation and refresh the list
- **Rule:** Stock cannot be negative
- **Exception E1:** Invalid data
- **Exception E2:** System error while saving
### UC-04 – Filter products by category and status
Administrator wants to filter products by category and status so that I can review prices for each product group.
- **Actors:** Administrator
- **Inputs:** Selects the "Filter products by category and status" function; Enters or selects the search criteria
- **Processing:** Displays the data list and the filter fields; Filters and displays the matching results
- **Outputs:** Goal achieved: I can review prices for each product group
- **Rule:** Filters can be combined with the search box
- **Rule:** There is an ''All categories'' option
- **Exception E1:** No matching data
### UC-05 – Discontinue a product
Administrator wants to discontinue a product so that customers cannot order discontinued items.
- **Actors:** Administrator
- **Inputs:** Selects the "Discontinue a product" function; Enters or selects the required information and confirms
- **Processing:** Displays the corresponding screen / form; Validates the data against the business rules; Saves the result and shows a success message
- **Outputs:** Goal achieved: customers cannot order discontinued items
- **Rule:** Ask for confirmation before discontinuing
- **Rule:** Discontinued products are not shown on the website
- **Exception E1:** Invalid data
- **Exception E2:** System error while saving

## 4. Non-functional Requirements

- Performance: main operations respond within 2 seconds with 100 concurrent users (Assumption – to be confirmed).
- Security: user authentication and role-based access control for every function (Assumption – to be confirmed).
- Audit: record who performed each data-changing operation and when (Assumption – to be confirmed).
- Availability: 99.5% uptime during business hours (Assumption – to be confirmed).

## 5. User Interfaces

| Use case | Proposed screen | Main actions |
|---|---|---|
| UC-01 | Search products by name or SKU | Selects the "Search products by name or SKU" function; Enters or selects the search criteria |
| UC-02 | Add a new product with name, SKU, category, price and stock | Selects the "Add a new product with name, SKU, category, price and stock" function; Enters or selects the required information and confirms |
| UC-03 | Edit the price and stock of a product | Selects the "Edit the price and stock of a product" function; Enters or selects the required information and confirms |
| UC-04 | Filter products by category and status | Selects the "Filter products by category and status" function; Enters or selects the search criteria |
| UC-05 | Discontinue a product | Selects the "Discontinue a product" function; Enters or selects the required information and confirms |

## 6. Data Requirements

| Data | Description | Use case |
|---|---|---|
| Search products by name or SKU information | Data created/read in UC-01 | UC-01 |
| Add a new product with name, SKU, category, price and stock information | Data created/read in UC-02 | UC-02 |
| Edit the price and stock of a product information | Data created/read in UC-03 | UC-03 |
| Filter products by category and status information | Data created/read in UC-04 | UC-04 |
| Discontinue a product information | Data created/read in UC-05 | UC-05 |

## 7. Assumptions and Open Issues

- Field-level details will be clarified once the screen design (prototype) is available.


## Use cases (names)
- UC-01: Search products by name or SKU
- UC-02: Add a new product with name, SKU, category, price and stock
- UC-03: Edit the price and stock of a product
- UC-04: Filter products by category and status
- UC-05: Discontinue a product', '{"code":"erDiagram\n  %% diagram: ERD – entities, key attributes, relationships\n  USER[\"User\"] {\n    uuid id PK \"Identifier\"\n    string full_name \"Full name\"\n    string email UK \"Email\"\n    string role \"Role\"\n  }\n  PRODUCTS[\"Products\"] {\n    uuid id PK \"Identifier\"\n    string code UK \"Products code\"\n    string name \"Name\"\n    string status \"Status\"\n    uuid created_by_id FK \"Created by\"\n    datetime created_at \"Created at\"\n  }\n  MATCHES_PART[\"Matches part\"] {\n    uuid id PK \"Identifier\"\n    string code UK \"Matches part code\"\n    string name \"Name\"\n    string status \"Status\"\n    uuid created_by_id FK \"Created by\"\n    datetime created_at \"Created at\"\n  }\n  PRODUCT[\"Product\"] {\n    uuid id PK \"Identifier\"\n    string code UK \"Product code\"\n    string name \"Name\"\n    string status \"Status\"\n    uuid created_by_id FK \"Created by\"\n    datetime created_at \"Created at\"\n  }\n  PRICE[\"Price\"] {\n    uuid id PK \"Identifier\"\n    string code UK \"Price code\"\n    string name \"Name\"\n    string status \"Status\"\n    uuid created_by_id FK \"Created by\"\n    datetime created_at \"Created at\"\n  }\n  BOX[\"Box\"] {\n    uuid id PK \"Identifier\"\n    string code UK \"Box code\"\n    string name \"Name\"\n    string status \"Status\"\n    uuid created_by_id FK \"Created by\"\n    datetime created_at \"Created at\"\n  }\n  CRITERIA[\"Criteria\"] {\n    uuid id PK \"Identifier\"\n    string code UK \"Criteria code\"\n    string name \"Name\"\n    string status \"Status\"\n    uuid created_by_id FK \"Created by\"\n    datetime created_at \"Created at\"\n  }\n  USER ||--o{ PRODUCTS : \"creates\"\n  USER ||--o{ MATCHES_PART : \"creates\"\n  USER ||--o{ PRODUCT : \"creates\"\n  USER ||--o{ PRICE : \"creates\"\n  USER ||--o{ BOX : \"creates\"\n  USER ||--o{ CRITERIA : \"creates\"\n  PRODUCTS ||--o{ PRODUCT : \"contains\"\n  PRODUCT ||--o{ PRICE : \"contains\"\n  PRODUCT ||--o{ CRITERIA : \"contains\"","parts":[]}', 1, '', 0, 0, 3, '2026-10-21T02:15:54.369Z');
INSERT INTO "prompt_runs" ("id", "module_id", "type", "provider", "model", "input", "output", "ok", "error", "input_tokens", "output_tokens", "latency_ms", "created_at") VALUES ('ab26a84b-85cb-4b3a-964c-6ee56e874bc9', 'demo-mod-products', 'generate_screen', 'mock', 'rule-based', 'Design ONE web screen according to the BA''s request.

## BA request
Product management: search by name or SKU, filter by category and status, a list table with columns Code, Product name, Price, Stock, Status, view/edit/delete actions, an Add new button and pagination.

## Module context (user stories, SRS, FRD-NFR)
### User story
- US-01 [High]: As a administrator, I want search products by name or SKU, so that I can check stock before restocking
  Acceptance criteria: Search matches part of the name, case-insensitive; When there are no results, show the message ''No products found''; Results are paginated at 20 rows per page
- US-02 [High]: As a administrator, I want add a new product with name, SKU, category, price and stock, so that the product can go on sale on the website
  Acceptance criteria: Product name is required, up to 100 characters; SKU must be unique; Price must be greater than 0
- US-03 [Medium]: As a administrator, I want edit the price and stock of a product, so that the information on the website is always correct
  Acceptance criteria: On successful save, show a confirmation and refresh the list; Stock cannot be negative
- US-04 [Medium]: As a administrator, I want filter products by category and status, so that I can review prices for each product group
  Acceptance criteria: Filters can be combined with the search box; There is an ''All categories'' option
- US-05 [Low]: As a administrator, I want discontinue a product, so that customers cannot order discontinued items
  Acceptance criteria: Ask for confirmation before discontinuing; Discontinued products are not shown on the website

### SRS (Done)
# SRS – Product Management

## 1. Introduction

### 1.1 Purpose
Software requirements specification for module **Product Management**, serving as the basis for design, development and testing.
### 1.2 Scope
- UC-01 – Search products by name or SKU
- UC-02 – Add a new product with name, SKU, category, price and stock
- UC-03 – Edit the price and stock of a product
- UC-04 – Filter products by category and status
- UC-05 – Discontinue a product
### 1.3 References
- Module BRD
- Module UC Specification

## 2. Overall Description

### 2.1 Actors
| Actor | Use case |
|---|---|
| Administrator | UC-01, UC-02, UC-03, UC-04, UC-05 |
### 2.2 General Constraints
- Every function requires the user to be signed in with the appropriate permissions.
- The user interface and messages are displayed in English.

## 3. Functional Requirements

### UC-01 – Search products by name or SKU
Administrator wants to search products by name or SKU so that I can check stock before restocking.
- **Actors:** Administrator
- **Inputs:** Selects the "Search products by name or SKU" function; Enters or selects the search criteria
- **Processing:** Displays the data list and the filter fields; Filters and displays the matching results
- **Outputs:** Goal achieved: I can check stock before restocking
- **Rule:** Search matches part of the name, case-insensitive
- **Rule:** When there are no results, show the message ''No products found''
- **Rule:** Results are paginated at 20 rows per page
- **Exception E1:** No matching data
### UC-02 – Add a new product with name, SKU, category, price and stock
Administrator wants to add a new product with name, SKU, category, price and stock so that the product can go on sale on the website.
- **Actors:** Administrator
- **Inputs:** Selects the "Add a new product with name, SKU, category, price and stock" function; Enters or selects the required information and confirms
- **Processing:** Displays the corresponding screen / form; Validates the data against the business rules; Saves the result and shows a success message
- **Outputs:** Goal achieved: the product can go on sale on the website
- **Rule:** Product name is required, up to 100 characters
- **Rule:** SKU must be unique
- **Rule:** Price must be greater than 0
- **Exception E1:** Invalid data
- **Exception E2:** System error while saving
### UC-03 – Edit the price and stock of a product
Administrator wants to edit the price and stock of a product so that the information on the website is always correct.
- **Actors:** Administrator
- **Inputs:** Selects the "Edit the price and stock of a product" function; Enters or selects the required information and confirms
- **Processing:** Displays the corresponding screen / form; Validates the data against the business rules; Saves the result and shows a success message
- **Outputs:** Goal achieved: the information on the website is always correct
- **Rule:** On successful save, show a confirmation and refresh the list
- **Rule:** Stock cannot be negative
- **Exception E1:** Invalid data
- **Exception E2:** System error while saving
### UC-04 – Filter products by category and status
Administrator wants to filter products by category and status so that I can review prices for each product group.
- **Actors:** Administrator
- **Inputs:** Selects the "Filter products by category and status" function; Enters or selects the search criteria
- **Processing:** Displays the data list and the filter fields; Filters and displays the matching results
- **Outputs:** Goal achieved: I can review prices for each product group
- **Rule:** Filters can be combined with the search box
- **Rule:** There is an ''All categories'' option
- **Exception E1:** No matching data
### UC-05 – Discontinue a product
Administrator wants to discontinue a product so that customers cannot order discontinued items.
- **Actors:** Administrator
- **Inputs:** Selects the "Discontinue a product" function; Enters or selects the required information and confirms
- **Processing:** Displays the corresponding screen / form; Validates the data against the business rules; Saves the result and shows a success message
- **Outputs:** Goal achieved: customers cannot order discontinued items
- **Rule:** Ask for confirmation before discontinuing
- **Rule:** Discontinued products are not shown on the website
- **Exception E1:** Invalid data
- **Exception E2:** System error while saving

## 4. Non-functional Requirements

- Performance: main operations respond within 2 seconds with 100 concurrent users (Assumption – to be confirmed).
- Security: user authentication and role-based access control for every function (Assumption – to be confirmed).
- Audit: record who performed each data-changing operation and when (Assumption – to be confirmed).
- Availability: 99.5% uptime during business hours (Assumption – to be confirmed).

## 5. User Interfaces

| Use case | Proposed screen | Main actions |
|---|---|---|
| UC-01 | Search products by name or SKU | Selects the "Search products by name or SKU" function; Enters or selects the search criteria |
| UC-02 | Add a new product with name, SKU, category, price and stock | Selects the "Add a new product with name, SKU, category, price and stock" function; Enters or selects the required information and confirms |
| UC-03 | Edit the price and stock of a product | Selects the "Edit the price and stock of a product" function; Enters or selects the required information and confirms |
| UC-04 | Filter products by category and status | Selects the "Filter products by category and status" function; Enters or selects the search criteria |
| UC-05 | Discontinue a product | Selects the "Discontinue a product" function; Enters or selects the required information and confirms |

## 6. Data Requirements

| Data | Description | Use case |
|---|---|---|
| Search products by name or SKU information | Data created/read in UC-01 | UC-01 |
| Add a new product with name, SKU, category, price and stock information | Data created/read in UC-02 | UC-02 |
| Edit the price and stock of a product information | Data created/read in UC-03 | UC-03 |
| Filter products by category and status information | Data created/read in UC-04 | UC-04 |
| Discontinue a product information | Data created/read in UC-05 | UC-05 |

## 7. Assumptions and Open Issues

- Field-level details will be clarified once the screen design (prototype) is available.

### FRD-NFR (Done)
- FR-01 (FR, High, UC-01): The system shall allow Administrator to search products by name or SKU.
- FR-02 (FR, Medium, UC-01): The system shall ensure that: Search matches part of the name, case-insensitive.
- FR-03 (FR, Medium, UC-01): The system shall ensure that: When there are no results, show the message ''No products found''.
- FR-04 (FR, Medium, UC-01): The system shall ensure that: Results are paginated at 20 rows per page.
- FR-05 (FR, High, UC-02): The system shall allow Administrator to add a new product with name, SKU, category, price and stock.
- FR-06 (FR, Medium, UC-02): The system shall ensure that: Product name is required, up to 100 characters.
- FR-07 (FR, Medium, UC-02): The system shall ensure that: SKU must be unique.
- FR-08 (FR, Medium, UC-02): The system shall ensure that: Price must be greater than 0.
- FR-09 (FR, Medium, UC-02): The system shall validate the input data of "Add a new product with name, SKU, category, price and stock" and show a clear error on each invalid field.
- FR-10 (FR, Medium, UC-03): The system shall allow Administrator to edit the price and stock of a product.
- FR-11 (FR, Medium, UC-03): The system shall ensure that: On successful save, show a confirmation and refresh the list.
- FR-12 (FR, Medium, UC-03): The system shall ensure that: Stock cannot be negative.
- FR-13 (FR, Medium, UC-03): The system shall validate the input data of "Edit the price and stock of a product" and show a clear error on each invalid field.
- FR-14 (FR, Medium, UC-04): The system shall allow Administrator to filter products by category and status.
- FR-15 (FR, Medium, UC-04): The system shall ensure that: Filters can be combined with the search box.
- FR-16 (FR, Medium, UC-04): The system shall ensure that: There is an ''All categories'' option.
- FR-17 (FR, Low, UC-05): The system shall allow Administrator to discontinue a product.
- FR-18 (FR, Medium, UC-05): The system shall ensure that: Ask for confirmation before discontinuing.
- FR-19 (FR, Medium, UC-05): The system shall ensure that: Discontinued products are not shown on the website.
- FR-20 (FR, Medium, UC-05): The system shall validate the input data of "Discontinue a product" and show a clear error on each invalid field.
- NFR-01 (NFR, Medium, UC-01/UC-02/UC-03/UC-04/UC-05): Main operations shall respond within 2 seconds with 100 concurrent users.
- NFR-02 (NFR, High, UC-01/UC-02/UC-03/UC-04/UC-05): Every function shall require authentication and role-based authorisation.
- NFR-03 (NFR, Medium, UC-01/UC-02/UC-03/UC-04/UC-05): The system shall log who performed each data-changing operation and when.
- NFR-04 (NFR, Low, UC-01/UC-02/UC-03/UC-04/UC-05): The system shall be available 99.5% of the time during business hours.

## Existing screens in the module (use exactly these names for navigateTo)
(none yet)

## Allowed component library
- Page: Screen root. props: { title }
- Header: Page header bar. props: { title? }
- Sidebar: Side navigation bar. props: {}
- Section: Titled content group. props: { title? }
- Card: Card container. props: { title? }
- Row: Lays out children horizontally. props: { gap?: number, align?: ''start''|''center''|''end''|''between'' }
- Column: Lays out children vertically. props: { gap?: number, width?: ''auto''|''1/3''|''1/2''|''2/3''|''full'' }
- Form: Form. props: { title?, submitAction? }
- List: Repeating list. props: { title? }
- Modal: Dialog. props: { title, open?: boolean }
- Heading: Heading. props: { text, level?: 1|2|3 }
- Text: Paragraph. props: { text, tone?: ''default''|''muted'' }
- Button: Button. props: { label, variant?: ''primary''|''secondary''|''danger''|''ghost'', action?: string, navigateTo?: string }
- Link: Link. props: { text, navigateTo? }
- Input: Text input. props: { label, name?, placeholder?, inputType?: ''text''|''email''|''password''|''number''|''tel'', required?: boolean, minLength?, maxLength?, min?, max?, pattern? }
- Textarea: Multi-line text input. props: { label, name?, placeholder?, required?, maxLength? }
- Select: Drop-down list. props: { label, name?, options: string[], required? }
- Checkbox: Checkbox. props: { label, name? }
- Radio: Radio button group. props: { label, name?, options: string[], required? }
- DatePicker: Date picker. props: { label, name?, required? }
- Table: Data table. props: { columns: string[], rows?: string[][], rowActions?: string[] }
- Image: Illustration image. props: { alt, height?: number }
- Badge: Status badge. props: { text, tone?: ''info''|''success''|''warning''|''danger'' }
- Alert: Alert message. props: { text, tone?: ''info''|''success''|''warning''|''danger'' }
- Stat: Metric. props: { label, value }
- Avatar: Avatar. props: { name }
- Divider: Divider line. props: {}
- Pagination: Pagination. props: { pages?: number }

## Rules
- The root node is a Page with props.title.
- Every node has a short, unique, meaningful snake_case id (e.g. login_form, btn_submit).
- Input fields must have a label, a name and sensible constraints (required, minLength, maxLength, inputType, pattern).
- Buttons have an action (a short English verb) and navigateTo when they lead to another screen.
- Sample data in a Table: at most 3 realistic rows, in English.
- The screen must satisfy the functional requirements (FR) and user stories related to it; take fields and constraints from the SRS/FRD-NFR when available.
- Clean, professional layout; about 40 nodes at most.', '{"name":"Product List","tree":{"id":"page","type":"Page","props":{"title":"Product List"},"children":[{"id":"n_d5bo4w011","type":"Heading","props":{"text":"Product List","level":1}},{"id":"n_d5bo18bx2","type":"Row","props":{"gap":8,"align":"between"},"children":[{"id":"n_d5boitij3","type":"Input","props":{"label":"Search","name":"keyword","placeholder":"Enter keywords..."}},{"id":"n_d5boegl54","type":"Select","props":{"label":"Category","name":"category","options":["All"]}},{"id":"n_d5bo59mj5","type":"Select","props":{"label":"Status","name":"status","options":["All"]}},{"id":"btn_create","type":"Button","props":{"label":"Add new","variant":"primary","action":"create"}}]},{"id":"n_d5bo08hg6","type":"Table","props":{"columns":["Code","Product name","Price","Stock","Status","View","Edit","Delete actions","An Add new button","Pagination","Actions"],"rows":[],"rowActions":["View","Edit","Delete"]}},{"id":"n_d5bomgqm7","type":"Pagination","props":{"pages":5}}]}}', 1, '', 0, 0, 5, '2026-10-21T02:15:54.420Z');
INSERT INTO "prompt_runs" ("id", "module_id", "type", "provider", "model", "input", "output", "ok", "error", "input_tokens", "output_tokens", "latency_ms", "created_at") VALUES ('d4a24f1c-99d1-4165-b824-012bc65123a0', 'demo-mod-products', 'generate_screen', 'mock', 'rule-based', 'Design ONE web screen according to the BA''s request.

## BA request
Add product form: product name (required, up to 100 characters), SKU, category, price, stock, description; Save and Cancel buttons.

## Module context (user stories, SRS, FRD-NFR)
### User story
- US-01 [High]: As a administrator, I want search products by name or SKU, so that I can check stock before restocking
  Acceptance criteria: Search matches part of the name, case-insensitive; When there are no results, show the message ''No products found''; Results are paginated at 20 rows per page
- US-02 [High]: As a administrator, I want add a new product with name, SKU, category, price and stock, so that the product can go on sale on the website
  Acceptance criteria: Product name is required, up to 100 characters; SKU must be unique; Price must be greater than 0
- US-03 [Medium]: As a administrator, I want edit the price and stock of a product, so that the information on the website is always correct
  Acceptance criteria: On successful save, show a confirmation and refresh the list; Stock cannot be negative
- US-04 [Medium]: As a administrator, I want filter products by category and status, so that I can review prices for each product group
  Acceptance criteria: Filters can be combined with the search box; There is an ''All categories'' option
- US-05 [Low]: As a administrator, I want discontinue a product, so that customers cannot order discontinued items
  Acceptance criteria: Ask for confirmation before discontinuing; Discontinued products are not shown on the website

### SRS (Done)
# SRS – Product Management

## 1. Introduction

### 1.1 Purpose
Software requirements specification for module **Product Management**, serving as the basis for design, development and testing.
### 1.2 Scope
- UC-01 – Search products by name or SKU
- UC-02 – Add a new product with name, SKU, category, price and stock
- UC-03 – Edit the price and stock of a product
- UC-04 – Filter products by category and status
- UC-05 – Discontinue a product
### 1.3 References
- Module BRD
- Module UC Specification

## 2. Overall Description

### 2.1 Actors
| Actor | Use case |
|---|---|
| Administrator | UC-01, UC-02, UC-03, UC-04, UC-05 |
### 2.2 General Constraints
- Every function requires the user to be signed in with the appropriate permissions.
- The user interface and messages are displayed in English.

## 3. Functional Requirements

### UC-01 – Search products by name or SKU
Administrator wants to search products by name or SKU so that I can check stock before restocking.
- **Actors:** Administrator
- **Inputs:** Selects the "Search products by name or SKU" function; Enters or selects the search criteria
- **Processing:** Displays the data list and the filter fields; Filters and displays the matching results
- **Outputs:** Goal achieved: I can check stock before restocking
- **Rule:** Search matches part of the name, case-insensitive
- **Rule:** When there are no results, show the message ''No products found''
- **Rule:** Results are paginated at 20 rows per page
- **Exception E1:** No matching data
### UC-02 – Add a new product with name, SKU, category, price and stock
Administrator wants to add a new product with name, SKU, category, price and stock so that the product can go on sale on the website.
- **Actors:** Administrator
- **Inputs:** Selects the "Add a new product with name, SKU, category, price and stock" function; Enters or selects the required information and confirms
- **Processing:** Displays the corresponding screen / form; Validates the data against the business rules; Saves the result and shows a success message
- **Outputs:** Goal achieved: the product can go on sale on the website
- **Rule:** Product name is required, up to 100 characters
- **Rule:** SKU must be unique
- **Rule:** Price must be greater than 0
- **Exception E1:** Invalid data
- **Exception E2:** System error while saving
### UC-03 – Edit the price and stock of a product
Administrator wants to edit the price and stock of a product so that the information on the website is always correct.
- **Actors:** Administrator
- **Inputs:** Selects the "Edit the price and stock of a product" function; Enters or selects the required information and confirms
- **Processing:** Displays the corresponding screen / form; Validates the data against the business rules; Saves the result and shows a success message
- **Outputs:** Goal achieved: the information on the website is always correct
- **Rule:** On successful save, show a confirmation and refresh the list
- **Rule:** Stock cannot be negative
- **Exception E1:** Invalid data
- **Exception E2:** System error while saving
### UC-04 – Filter products by category and status
Administrator wants to filter products by category and status so that I can review prices for each product group.
- **Actors:** Administrator
- **Inputs:** Selects the "Filter products by category and status" function; Enters or selects the search criteria
- **Processing:** Displays the data list and the filter fields; Filters and displays the matching results
- **Outputs:** Goal achieved: I can review prices for each product group
- **Rule:** Filters can be combined with the search box
- **Rule:** There is an ''All categories'' option
- **Exception E1:** No matching data
### UC-05 – Discontinue a product
Administrator wants to discontinue a product so that customers cannot order discontinued items.
- **Actors:** Administrator
- **Inputs:** Selects the "Discontinue a product" function; Enters or selects the required information and confirms
- **Processing:** Displays the corresponding screen / form; Validates the data against the business rules; Saves the result and shows a success message
- **Outputs:** Goal achieved: customers cannot order discontinued items
- **Rule:** Ask for confirmation before discontinuing
- **Rule:** Discontinued products are not shown on the website
- **Exception E1:** Invalid data
- **Exception E2:** System error while saving

## 4. Non-functional Requirements

- Performance: main operations respond within 2 seconds with 100 concurrent users (Assumption – to be confirmed).
- Security: user authentication and role-based access control for every function (Assumption – to be confirmed).
- Audit: record who performed each data-changing operation and when (Assumption – to be confirmed).
- Availability: 99.5% uptime during business hours (Assumption – to be confirmed).

## 5. User Interfaces

| Use case | Proposed screen | Main actions |
|---|---|---|
| UC-01 | Search products by name or SKU | Selects the "Search products by name or SKU" function; Enters or selects the search criteria |
| UC-02 | Add a new product with name, SKU, category, price and stock | Selects the "Add a new product with name, SKU, category, price and stock" function; Enters or selects the required information and confirms |
| UC-03 | Edit the price and stock of a product | Selects the "Edit the price and stock of a product" function; Enters or selects the required information and confirms |
| UC-04 | Filter products by category and status | Selects the "Filter products by category and status" function; Enters or selects the search criteria |
| UC-05 | Discontinue a product | Selects the "Discontinue a product" function; Enters or selects the required information and confirms |

## 6. Data Requirements

| Data | Description | Use case |
|---|---|---|
| Search products by name or SKU information | Data created/read in UC-01 | UC-01 |
| Add a new product with name, SKU, category, price and stock information | Data created/read in UC-02 | UC-02 |
| Edit the price and stock of a product information | Data created/read in UC-03 | UC-03 |
| Filter products by category and status information | Data created/read in UC-04 | UC-04 |
| Discontinue a product information | Data created/read in UC-05 | UC-05 |

## 7. Assumptions and Open Issues

- Field-level details will be clarified once the screen design (prototype) is available.

### FRD-NFR (Done)
- FR-01 (FR, High, UC-01): The system shall allow Administrator to search products by name or SKU.
- FR-02 (FR, Medium, UC-01): The system shall ensure that: Search matches part of the name, case-insensitive.
- FR-03 (FR, Medium, UC-01): The system shall ensure that: When there are no results, show the message ''No products found''.
- FR-04 (FR, Medium, UC-01): The system shall ensure that: Results are paginated at 20 rows per page.
- FR-05 (FR, High, UC-02): The system shall allow Administrator to add a new product with name, SKU, category, price and stock.
- FR-06 (FR, Medium, UC-02): The system shall ensure that: Product name is required, up to 100 characters.
- FR-07 (FR, Medium, UC-02): The system shall ensure that: SKU must be unique.
- FR-08 (FR, Medium, UC-02): The system shall ensure that: Price must be greater than 0.
- FR-09 (FR, Medium, UC-02): The system shall validate the input data of "Add a new product with name, SKU, category, price and stock" and show a clear error on each invalid field.
- FR-10 (FR, Medium, UC-03): The system shall allow Administrator to edit the price and stock of a product.
- FR-11 (FR, Medium, UC-03): The system shall ensure that: On successful save, show a confirmation and refresh the list.
- FR-12 (FR, Medium, UC-03): The system shall ensure that: Stock cannot be negative.
- FR-13 (FR, Medium, UC-03): The system shall validate the input data of "Edit the price and stock of a product" and show a clear error on each invalid field.
- FR-14 (FR, Medium, UC-04): The system shall allow Administrator to filter products by category and status.
- FR-15 (FR, Medium, UC-04): The system shall ensure that: Filters can be combined with the search box.
- FR-16 (FR, Medium, UC-04): The system shall ensure that: There is an ''All categories'' option.
- FR-17 (FR, Low, UC-05): The system shall allow Administrator to discontinue a product.
- FR-18 (FR, Medium, UC-05): The system shall ensure that: Ask for confirmation before discontinuing.
- FR-19 (FR, Medium, UC-05): The system shall ensure that: Discontinued products are not shown on the website.
- FR-20 (FR, Medium, UC-05): The system shall validate the input data of "Discontinue a product" and show a clear error on each invalid field.
- NFR-01 (NFR, Medium, UC-01/UC-02/UC-03/UC-04/UC-05): Main operations shall respond within 2 seconds with 100 concurrent users.
- NFR-02 (NFR, High, UC-01/UC-02/UC-03/UC-04/UC-05): Every function shall require authentication and role-based authorisation.
- NFR-03 (NFR, Medium, UC-01/UC-02/UC-03/UC-04/UC-05): The system shall log who performed each data-changing operation and when.
- NFR-04 (NFR, Low, UC-01/UC-02/UC-03/UC-04/UC-05): The system shall be available 99.5% of the time during business hours.

## Existing screens in the module (use exactly these names for navigateTo)
- Product List

## Allowed component library
- Page: Screen root. props: { title }
- Header: Page header bar. props: { title? }
- Sidebar: Side navigation bar. props: {}
- Section: Titled content group. props: { title? }
- Card: Card container. props: { title? }
- Row: Lays out children horizontally. props: { gap?: number, align?: ''start''|''center''|''end''|''between'' }
- Column: Lays out children vertically. props: { gap?: number, width?: ''auto''|''1/3''|''1/2''|''2/3''|''full'' }
- Form: Form. props: { title?, submitAction? }
- List: Repeating list. props: { title? }
- Modal: Dialog. props: { title, open?: boolean }
- Heading: Heading. props: { text, level?: 1|2|3 }
- Text: Paragraph. props: { text, tone?: ''default''|''muted'' }
- Button: Button. props: { label, variant?: ''primary''|''secondary''|''danger''|''ghost'', action?: string, navigateTo?: string }
- Link: Link. props: { text, navigateTo? }
- Input: Text input. props: { label, name?, placeholder?, inputType?: ''text''|''email''|''password''|''number''|''tel'', required?: boolean, minLength?, maxLength?, min?, max?, pattern? }
- Textarea: Multi-line text input. props: { label, name?, placeholder?, required?, maxLength? }
- Select: Drop-down list. props: { label, name?, options: string[], required? }
- Checkbox: Checkbox. props: { label, name? }
- Radio: Radio button group. props: { label, name?, options: string[], required? }
- DatePicker: Date picker. props: { label, name?, required? }
- Table: Data table. props: { columns: string[], rows?: string[][], rowActions?: string[] }
- Image: Illustration image. props: { alt, height?: number }
- Badge: Status badge. props: { text, tone?: ''info''|''success''|''warning''|''danger'' }
- Alert: Alert message. props: { text, tone?: ''info''|''success''|''warning''|''danger'' }
- Stat: Metric. props: { label, value }
- Avatar: Avatar. props: { name }
- Divider: Divider line. props: {}
- Pagination: Pagination. props: { pages?: number }

## Rules
- The root node is a Page with props.title.
- Every node has a short, unique, meaningful snake_case id (e.g. login_form, btn_submit).
- Input fields must have a label, a name and sensible constraints (required, minLength, maxLength, inputType, pattern).
- Buttons have an action (a short English verb) and navigateTo when they lead to another screen.
- Sample data in a Table: at most 3 realistic rows, in English.
- The screen must satisfy the functional requirements (FR) and user stories related to it; take fields and constraints from the SRS/FRD-NFR when available.
- Clean, professional layout; about 40 nodes at most.', '{"name":"Add Product","tree":{"id":"page","type":"Page","props":{"title":"Add Product"},"children":[{"id":"n_d5c03e3l8","type":"Heading","props":{"text":"Add Product","level":1}},{"id":"n_d5c0hyxe9","type":"Form","props":{"submitAction":"save"},"children":[{"id":"n_d5c0j3qza","type":"Input","props":{"label":"Product name","name":"product_name","placeholder":"Enter product name","required":true,"maxLength":100}},{"id":"n_d5c04897b","type":"Input","props":{"label":"SKU","name":"sku","placeholder":"Enter sku","required":true,"maxLength":100}},{"id":"n_d5c0meipc","type":"Select","props":{"label":"Category","options":["Type 1","Type 2","Type 3"],"name":"category","required":true}},{"id":"n_d5c0c2fgd","type":"Input","props":{"label":"Price","inputType":"number","name":"price","placeholder":"Enter price","required":true,"maxLength":100}},{"id":"n_d5c05ecle","type":"Input","props":{"label":"Stock","inputType":"number","name":"stock","placeholder":"Enter stock","required":true,"maxLength":100}},{"id":"n_d5c0xk8zf","type":"Textarea","props":{"label":"Description","name":"description","placeholder":"Enter description","required":true,"maxLength":100}},{"id":"n_d5c0iw1jg","type":"Row","props":{"gap":8,"align":"end"},"children":[{"id":"btn_save","type":"Button","props":{"label":"Save","variant":"primary","action":"save"}},{"id":"btn_cancel","type":"Button","props":{"label":"Cancel","variant":"secondary","action":"cancel"}}]}]}]}}', 1, '', 0, 0, 2, '2026-10-21T02:15:54.432Z');
INSERT INTO "prompt_runs" ("id", "module_id", "type", "provider", "model", "input", "output", "ok", "error", "input_tokens", "output_tokens", "latency_ms", "created_at") VALUES ('13a0f8cc-f29b-45c1-ad6b-97479b2b371d', 'demo-mod-products', 'generate_screen', 'mock', 'rule-based', 'Design ONE web screen according to the BA''s request.

## BA request
Category management: search by name, a list table with columns Code, Category name, Number of products, edit/delete actions and an Add new button.

## Module context (user stories, SRS, FRD-NFR)
### User story
- US-01 [High]: As a administrator, I want search products by name or SKU, so that I can check stock before restocking
  Acceptance criteria: Search matches part of the name, case-insensitive; When there are no results, show the message ''No products found''; Results are paginated at 20 rows per page
- US-02 [High]: As a administrator, I want add a new product with name, SKU, category, price and stock, so that the product can go on sale on the website
  Acceptance criteria: Product name is required, up to 100 characters; SKU must be unique; Price must be greater than 0
- US-03 [Medium]: As a administrator, I want edit the price and stock of a product, so that the information on the website is always correct
  Acceptance criteria: On successful save, show a confirmation and refresh the list; Stock cannot be negative
- US-04 [Medium]: As a administrator, I want filter products by category and status, so that I can review prices for each product group
  Acceptance criteria: Filters can be combined with the search box; There is an ''All categories'' option
- US-05 [Low]: As a administrator, I want discontinue a product, so that customers cannot order discontinued items
  Acceptance criteria: Ask for confirmation before discontinuing; Discontinued products are not shown on the website

### SRS (Done)
# SRS – Product Management

## 1. Introduction

### 1.1 Purpose
Software requirements specification for module **Product Management**, serving as the basis for design, development and testing.
### 1.2 Scope
- UC-01 – Search products by name or SKU
- UC-02 – Add a new product with name, SKU, category, price and stock
- UC-03 – Edit the price and stock of a product
- UC-04 – Filter products by category and status
- UC-05 – Discontinue a product
### 1.3 References
- Module BRD
- Module UC Specification

## 2. Overall Description

### 2.1 Actors
| Actor | Use case |
|---|---|
| Administrator | UC-01, UC-02, UC-03, UC-04, UC-05 |
### 2.2 General Constraints
- Every function requires the user to be signed in with the appropriate permissions.
- The user interface and messages are displayed in English.

## 3. Functional Requirements

### UC-01 – Search products by name or SKU
Administrator wants to search products by name or SKU so that I can check stock before restocking.
- **Actors:** Administrator
- **Inputs:** Selects the "Search products by name or SKU" function; Enters or selects the search criteria
- **Processing:** Displays the data list and the filter fields; Filters and displays the matching results
- **Outputs:** Goal achieved: I can check stock before restocking
- **Rule:** Search matches part of the name, case-insensitive
- **Rule:** When there are no results, show the message ''No products found''
- **Rule:** Results are paginated at 20 rows per page
- **Exception E1:** No matching data
### UC-02 – Add a new product with name, SKU, category, price and stock
Administrator wants to add a new product with name, SKU, category, price and stock so that the product can go on sale on the website.
- **Actors:** Administrator
- **Inputs:** Selects the "Add a new product with name, SKU, category, price and stock" function; Enters or selects the required information and confirms
- **Processing:** Displays the corresponding screen / form; Validates the data against the business rules; Saves the result and shows a success message
- **Outputs:** Goal achieved: the product can go on sale on the website
- **Rule:** Product name is required, up to 100 characters
- **Rule:** SKU must be unique
- **Rule:** Price must be greater than 0
- **Exception E1:** Invalid data
- **Exception E2:** System error while saving
### UC-03 – Edit the price and stock of a product
Administrator wants to edit the price and stock of a product so that the information on the website is always correct.
- **Actors:** Administrator
- **Inputs:** Selects the "Edit the price and stock of a product" function; Enters or selects the required information and confirms
- **Processing:** Displays the corresponding screen / form; Validates the data against the business rules; Saves the result and shows a success message
- **Outputs:** Goal achieved: the information on the website is always correct
- **Rule:** On successful save, show a confirmation and refresh the list
- **Rule:** Stock cannot be negative
- **Exception E1:** Invalid data
- **Exception E2:** System error while saving
### UC-04 – Filter products by category and status
Administrator wants to filter products by category and status so that I can review prices for each product group.
- **Actors:** Administrator
- **Inputs:** Selects the "Filter products by category and status" function; Enters or selects the search criteria
- **Processing:** Displays the data list and the filter fields; Filters and displays the matching results
- **Outputs:** Goal achieved: I can review prices for each product group
- **Rule:** Filters can be combined with the search box
- **Rule:** There is an ''All categories'' option
- **Exception E1:** No matching data
### UC-05 – Discontinue a product
Administrator wants to discontinue a product so that customers cannot order discontinued items.
- **Actors:** Administrator
- **Inputs:** Selects the "Discontinue a product" function; Enters or selects the required information and confirms
- **Processing:** Displays the corresponding screen / form; Validates the data against the business rules; Saves the result and shows a success message
- **Outputs:** Goal achieved: customers cannot order discontinued items
- **Rule:** Ask for confirmation before discontinuing
- **Rule:** Discontinued products are not shown on the website
- **Exception E1:** Invalid data
- **Exception E2:** System error while saving

## 4. Non-functional Requirements

- Performance: main operations respond within 2 seconds with 100 concurrent users (Assumption – to be confirmed).
- Security: user authentication and role-based access control for every function (Assumption – to be confirmed).
- Audit: record who performed each data-changing operation and when (Assumption – to be confirmed).
- Availability: 99.5% uptime during business hours (Assumption – to be confirmed).

## 5. User Interfaces

| Use case | Proposed screen | Main actions |
|---|---|---|
| UC-01 | Search products by name or SKU | Selects the "Search products by name or SKU" function; Enters or selects the search criteria |
| UC-02 | Add a new product with name, SKU, category, price and stock | Selects the "Add a new product with name, SKU, category, price and stock" function; Enters or selects the required information and confirms |
| UC-03 | Edit the price and stock of a product | Selects the "Edit the price and stock of a product" function; Enters or selects the required information and confirms |
| UC-04 | Filter products by category and status | Selects the "Filter products by category and status" function; Enters or selects the search criteria |
| UC-05 | Discontinue a product | Selects the "Discontinue a product" function; Enters or selects the required information and confirms |

## 6. Data Requirements

| Data | Description | Use case |
|---|---|---|
| Search products by name or SKU information | Data created/read in UC-01 | UC-01 |
| Add a new product with name, SKU, category, price and stock information | Data created/read in UC-02 | UC-02 |
| Edit the price and stock of a product information | Data created/read in UC-03 | UC-03 |
| Filter products by category and status information | Data created/read in UC-04 | UC-04 |
| Discontinue a product information | Data created/read in UC-05 | UC-05 |

## 7. Assumptions and Open Issues

- Field-level details will be clarified once the screen design (prototype) is available.

### FRD-NFR (Done)
- FR-01 (FR, High, UC-01): The system shall allow Administrator to search products by name or SKU.
- FR-02 (FR, Medium, UC-01): The system shall ensure that: Search matches part of the name, case-insensitive.
- FR-03 (FR, Medium, UC-01): The system shall ensure that: When there are no results, show the message ''No products found''.
- FR-04 (FR, Medium, UC-01): The system shall ensure that: Results are paginated at 20 rows per page.
- FR-05 (FR, High, UC-02): The system shall allow Administrator to add a new product with name, SKU, category, price and stock.
- FR-06 (FR, Medium, UC-02): The system shall ensure that: Product name is required, up to 100 characters.
- FR-07 (FR, Medium, UC-02): The system shall ensure that: SKU must be unique.
- FR-08 (FR, Medium, UC-02): The system shall ensure that: Price must be greater than 0.
- FR-09 (FR, Medium, UC-02): The system shall validate the input data of "Add a new product with name, SKU, category, price and stock" and show a clear error on each invalid field.
- FR-10 (FR, Medium, UC-03): The system shall allow Administrator to edit the price and stock of a product.
- FR-11 (FR, Medium, UC-03): The system shall ensure that: On successful save, show a confirmation and refresh the list.
- FR-12 (FR, Medium, UC-03): The system shall ensure that: Stock cannot be negative.
- FR-13 (FR, Medium, UC-03): The system shall validate the input data of "Edit the price and stock of a product" and show a clear error on each invalid field.
- FR-14 (FR, Medium, UC-04): The system shall allow Administrator to filter products by category and status.
- FR-15 (FR, Medium, UC-04): The system shall ensure that: Filters can be combined with the search box.
- FR-16 (FR, Medium, UC-04): The system shall ensure that: There is an ''All categories'' option.
- FR-17 (FR, Low, UC-05): The system shall allow Administrator to discontinue a product.
- FR-18 (FR, Medium, UC-05): The system shall ensure that: Ask for confirmation before discontinuing.
- FR-19 (FR, Medium, UC-05): The system shall ensure that: Discontinued products are not shown on the website.
- FR-20 (FR, Medium, UC-05): The system shall validate the input data of "Discontinue a product" and show a clear error on each invalid field.
- NFR-01 (NFR, Medium, UC-01/UC-02/UC-03/UC-04/UC-05): Main operations shall respond within 2 seconds with 100 concurrent users.
- NFR-02 (NFR, High, UC-01/UC-02/UC-03/UC-04/UC-05): Every function shall require authentication and role-based authorisation.
- NFR-03 (NFR, Medium, UC-01/UC-02/UC-03/UC-04/UC-05): The system shall log who performed each data-changing operation and when.
- NFR-04 (NFR, Low, UC-01/UC-02/UC-03/UC-04/UC-05): The system shall be available 99.5% of the time during business hours.

## Existing screens in the module (use exactly these names for navigateTo)
- Product List
- Add Product

## Allowed component library
- Page: Screen root. props: { title }
- Header: Page header bar. props: { title? }
- Sidebar: Side navigation bar. props: {}
- Section: Titled content group. props: { title? }
- Card: Card container. props: { title? }
- Row: Lays out children horizontally. props: { gap?: number, align?: ''start''|''center''|''end''|''between'' }
- Column: Lays out children vertically. props: { gap?: number, width?: ''auto''|''1/3''|''1/2''|''2/3''|''full'' }
- Form: Form. props: { title?, submitAction? }
- List: Repeating list. props: { title? }
- Modal: Dialog. props: { title, open?: boolean }
- Heading: Heading. props: { text, level?: 1|2|3 }
- Text: Paragraph. props: { text, tone?: ''default''|''muted'' }
- Button: Button. props: { label, variant?: ''primary''|''secondary''|''danger''|''ghost'', action?: string, navigateTo?: string }
- Link: Link. props: { text, navigateTo? }
- Input: Text input. props: { label, name?, placeholder?, inputType?: ''text''|''email''|''password''|''number''|''tel'', required?: boolean, minLength?, maxLength?, min?, max?, pattern? }
- Textarea: Multi-line text input. props: { label, name?, placeholder?, required?, maxLength? }
- Select: Drop-down list. props: { label, name?, options: string[], required? }
- Checkbox: Checkbox. props: { label, name? }
- Radio: Radio button group. props: { label, name?, options: string[], required? }
- DatePicker: Date picker. props: { label, name?, required? }
- Table: Data table. props: { columns: string[], rows?: string[][], rowActions?: string[] }
- Image: Illustration image. props: { alt, height?: number }
- Badge: Status badge. props: { text, tone?: ''info''|''success''|''warning''|''danger'' }
- Alert: Alert message. props: { text, tone?: ''info''|''success''|''warning''|''danger'' }
- Stat: Metric. props: { label, value }
- Avatar: Avatar. props: { name }
- Divider: Divider line. props: {}
- Pagination: Pagination. props: { pages?: number }

## Rules
- The root node is a Page with props.title.
- Every node has a short, unique, meaningful snake_case id (e.g. login_form, btn_submit).
- Input fields must have a label, a name and sensible constraints (required, minLength, maxLength, inputType, pattern).
- Buttons have an action (a short English verb) and navigateTo when they lead to another screen.
- Sample data in a Table: at most 3 realistic rows, in English.
- The screen must satisfy the functional requirements (FR) and user stories related to it; take fields and constraints from the SRS/FRD-NFR when available.
- Clean, professional layout; about 40 nodes at most.', '{"name":"Category Management","tree":{"id":"page","type":"Page","props":{"title":"Category Management"},"children":[{"id":"n_d5c9hwaqh","type":"Heading","props":{"text":"Category Management","level":1}},{"id":"n_d5c9jzxxi","type":"Row","props":{"gap":8,"align":"between"},"children":[{"id":"n_d5c9vd2bj","type":"Input","props":{"label":"Search","name":"keyword","placeholder":"Enter keywords..."}},{"id":"btn_create","type":"Button","props":{"label":"Add new","variant":"primary","action":"create"}}]},{"id":"n_d5c9ak2gk","type":"Table","props":{"columns":["Code","Category name","Number of products","Edit","Delete actions","An Add new button","Actions"],"rows":[],"rowActions":["Edit","Delete"]}},{"id":"n_d5c9igahl","type":"Row","props":{"gap":8},"children":[{"id":"n_d5c9ts2bm","type":"Button","props":{"label":"Edit","variant":"primary","action":"click"}},{"id":"btn_delete","type":"Button","props":{"label":"Delete actions","variant":"primary","action":"delete"}}]}]}}', 1, '', 0, 0, 1, '2026-10-21T02:15:54.441Z');
INSERT INTO "prompt_runs" ("id", "module_id", "type", "provider", "model", "input", "output", "ok", "error", "input_tokens", "output_tokens", "latency_ms", "created_at") VALUES ('e9a77e91-6261-4dc2-94ff-3fcf57d1a2e8', 'demo-mod-products', 'generate_tests', 'mock', 'rule-based', 'Generate a manual test suite for the module based on the UC Specification and the FRD-NFR (both Done).
Required techniques:
- Scenario testing: every flow (main, each A*, each E*) of every use case has at least 1 test; flowRef = "main" or the flow ID.
- Equivalence partitioning & boundary value analysis: every field with minLength/maxLength/min/max → Boundary tests (below, at and above the boundary).
- Every test references at least 1 requirement ID (requirementCodes) from the list.
- Every functional requirement (FR) has at least 1 test. If there are no use cases, leave useCaseCode empty ("").
- Test IDs: TC-001, TC-002...; type: Positive | Negative | Boundary; priority: High | Medium | Low.
- steps are concrete test steps; testData is concrete test data; expected is a verifiable expected result.

## Use cases
[{"code":"UC-01","name":"Search products by name or SKU","actors":["Administrator"],"storyCodes":["US-01"],"description":"Administrator wants to search products by name or SKU so that I can check stock before restocking.","trigger":"Administrator selects the \"Search products by name or SKU\" function","preconditions":["Administrator is signed in and has permission to use the function"],"postconditions":["Goal achieved: I can check stock before restocking"],"mainFlow":[{"no":1,"actor":"Administrator","text":"Selects the \"Search products by name or SKU\" function"},{"no":2,"actor":"System","text":"Displays the data list and the filter fields"},{"no":3,"actor":"Administrator","text":"Enters or selects the search criteria"},{"no":4,"actor":"System","text":"Filters and displays the matching results"}],"altFlows":[{"code":"A1","name":"User cancels the operation","branchFrom":3,"steps":["Administrator selects Cancel","System closes the screen without saving changes"]}],"exceptions":[{"code":"E1","name":"No matching data","branchFrom":4,"steps":["System displays the message \"No matching data found\""]}],"businessRules":["Search matches part of the name, case-insensitive","When there are no results, show the message ''No products found''","Results are paginated at 20 rows per page"],"screenIds":[],"assumptions":[]},{"code":"UC-02","name":"Add a new product with name, SKU, category, price and stock","actors":["Administrator"],"storyCodes":["US-02"],"description":"Administrator wants to add a new product with name, SKU, category, price and stock so that the product can go on sale on the website.","trigger":"Administrator selects the \"Add a new product with name, SKU, category, price and stock\" function","preconditions":["Administrator is signed in and has permission to use the function"],"postconditions":["Goal achieved: the product can go on sale on the website"],"mainFlow":[{"no":1,"actor":"Administrator","text":"Selects the \"Add a new product with name, SKU, category, price and stock\" function"},{"no":2,"actor":"System","text":"Displays the corresponding screen / form"},{"no":3,"actor":"Administrator","text":"Enters or selects the required information and confirms"},{"no":4,"actor":"System","text":"Validates the data against the business rules"},{"no":5,"actor":"System","text":"Saves the result and shows a success message"}],"altFlows":[{"code":"A1","name":"User cancels the operation","branchFrom":3,"steps":["Administrator selects Cancel","System closes the screen without saving changes"]}],"exceptions":[{"code":"E1","name":"Invalid data","branchFrom":4,"steps":["System shows an error on the invalid field","Return to step 3"]},{"code":"E2","name":"System error while saving","branchFrom":5,"steps":["System reports that saving failed and keeps the entered data"]}],"businessRules":["Product name is required, up to 100 characters","SKU must be unique","Price must be greater than 0"],"screenIds":[],"assumptions":[]},{"code":"UC-03","name":"Edit the price and stock of a product","actors":["Administrator"],"storyCodes":["US-03"],"description":"Administrator wants to edit the price and stock of a product so that the information on the website is always correct.","trigger":"Administrator selects the \"Edit the price and stock of a product\" function","preconditions":["Administrator is signed in and has permission to use the function"],"postconditions":["Goal achieved: the information on the website is always correct"],"mainFlow":[{"no":1,"actor":"Administrator","text":"Selects the \"Edit the price and stock of a product\" function"},{"no":2,"actor":"System","text":"Displays the corresponding screen / form"},{"no":3,"actor":"Administrator","text":"Enters or selects the required information and confirms"},{"no":4,"actor":"System","text":"Validates the data against the business rules"},{"no":5,"actor":"System","text":"Saves the result and shows a success message"}],"altFlows":[{"code":"A1","name":"User cancels the operation","branchFrom":3,"steps":["Administrator selects Cancel","System closes the screen without saving changes"]}],"exceptions":[{"code":"E1","name":"Invalid data","branchFrom":4,"steps":["System shows an error on the invalid field","Return to step 3"]},{"code":"E2","name":"System error while saving","branchFrom":5,"steps":["System reports that saving failed and keeps the entered data"]}],"businessRules":["On successful save, show a confirmation and refresh the list","Stock cannot be negative"],"screenIds":[],"assumptions":[]},{"code":"UC-04","name":"Filter products by category and status","actors":["Administrator"],"storyCodes":["US-04"],"description":"Administrator wants to filter products by category and status so that I can review prices for each product group.","trigger":"Administrator selects the \"Filter products by category and status\" function","preconditions":["Administrator is signed in and has permission to use the function"],"postconditions":["Goal achieved: I can review prices for each product group"],"mainFlow":[{"no":1,"actor":"Administrator","text":"Selects the \"Filter products by category and status\" function"},{"no":2,"actor":"System","text":"Displays the data list and the filter fields"},{"no":3,"actor":"Administrator","text":"Enters or selects the search criteria"},{"no":4,"actor":"System","text":"Filters and displays the matching results"}],"altFlows":[{"code":"A1","name":"User cancels the operation","branchFrom":3,"steps":["Administrator selects Cancel","System closes the screen without saving changes"]}],"exceptions":[{"code":"E1","name":"No matching data","branchFrom":4,"steps":["System displays the message \"No matching data found\""]}],"businessRules":["Filters can be combined with the search box","There is an ''All categories'' option"],"screenIds":[],"assumptions":[]},{"code":"UC-05","name":"Discontinue a product","actors":["Administrator"],"storyCodes":["US-05"],"description":"Administrator wants to discontinue a product so that customers cannot order discontinued items.","trigger":"Administrator selects the \"Discontinue a product\" function","preconditions":["Administrator is signed in and has permission to use the function"],"postconditions":["Goal achieved: customers cannot order discontinued items"],"mainFlow":[{"no":1,"actor":"Administrator","text":"Selects the \"Discontinue a product\" function"},{"no":2,"actor":"System","text":"Displays the corresponding screen / form"},{"no":3,"actor":"Administrator","text":"Enters or selects the required information and confirms"},{"no":4,"actor":"System","text":"Validates the data against the business rules"},{"no":5,"actor":"System","text":"Saves the result and shows a success message"}],"altFlows":[{"code":"A1","name":"User cancels the operation","branchFrom":3,"steps":["Administrator selects Cancel","System closes the screen without saving changes"]}],"exceptions":[{"code":"E1","name":"Invalid data","branchFrom":4,"steps":["System shows an error on the invalid field","Return to step 3"]},{"code":"E2","name":"System error while saving","branchFrom":5,"steps":["System reports that saving failed and keeps the entered data"]}],"businessRules":["Ask for confirmation before discontinuing","Discontinued products are not shown on the website"],"screenIds":[],"assumptions":[]}]
## Requirements
[{"code":"FR-01","type":"FR","statement":"The system shall allow Administrator to search products by name or SKU.","priority":"High","useCaseCodes":["UC-01"],"source":"UC-01 main flow","isAssumption":false},{"code":"FR-02","type":"FR","statement":"The system shall ensure that: Search matches part of the name, case-insensitive.","priority":"Medium","useCaseCodes":["UC-01"],"source":"UC-01 business rule","isAssumption":false},{"code":"FR-03","type":"FR","statement":"The system shall ensure that: When there are no results, show the message ''No products found''.","priority":"Medium","useCaseCodes":["UC-01"],"source":"UC-01 business rule","isAssumption":false},{"code":"FR-04","type":"FR","statement":"The system shall ensure that: Results are paginated at 20 rows per page.","priority":"Medium","useCaseCodes":["UC-01"],"source":"UC-01 business rule","isAssumption":false},{"code":"FR-05","type":"FR","statement":"The system shall allow Administrator to add a new product with name, SKU, category, price and stock.","priority":"High","useCaseCodes":["UC-02"],"source":"UC-02 main flow","isAssumption":false},{"code":"FR-06","type":"FR","statement":"The system shall ensure that: Product name is required, up to 100 characters.","priority":"Medium","useCaseCodes":["UC-02"],"source":"UC-02 business rule","isAssumption":false},{"code":"FR-07","type":"FR","statement":"The system shall ensure that: SKU must be unique.","priority":"Medium","useCaseCodes":["UC-02"],"source":"UC-02 business rule","isAssumption":false},{"code":"FR-08","type":"FR","statement":"The system shall ensure that: Price must be greater than 0.","priority":"Medium","useCaseCodes":["UC-02"],"source":"UC-02 business rule","isAssumption":false},{"code":"FR-09","type":"FR","statement":"The system shall validate the input data of \"Add a new product with name, SKU, category, price and stock\" and show a clear error on each invalid field.","priority":"Medium","useCaseCodes":["UC-02"],"source":"UC-02 E1","isAssumption":false},{"code":"FR-10","type":"FR","statement":"The system shall allow Administrator to edit the price and stock of a product.","priority":"Medium","useCaseCodes":["UC-03"],"source":"UC-03 main flow","isAssumption":false},{"code":"FR-11","type":"FR","statement":"The system shall ensure that: On successful save, show a confirmation and refresh the list.","priority":"Medium","useCaseCodes":["UC-03"],"source":"UC-03 business rule","isAssumption":false},{"code":"FR-12","type":"FR","statement":"The system shall ensure that: Stock cannot be negative.","priority":"Medium","useCaseCodes":["UC-03"],"source":"UC-03 business rule","isAssumption":false},{"code":"FR-13","type":"FR","statement":"The system shall validate the input data of \"Edit the price and stock of a product\" and show a clear error on each invalid field.","priority":"Medium","useCaseCodes":["UC-03"],"source":"UC-03 E1","isAssumption":false},{"code":"FR-14","type":"FR","statement":"The system shall allow Administrator to filter products by category and status.","priority":"Medium","useCaseCodes":["UC-04"],"source":"UC-04 main flow","isAssumption":false},{"code":"FR-15","type":"FR","statement":"The system shall ensure that: Filters can be combined with the search box.","priority":"Medium","useCaseCodes":["UC-04"],"source":"UC-04 business rule","isAssumption":false},{"code":"FR-16","type":"FR","statement":"The system shall ensure that: There is an ''All categories'' option.","priority":"Medium","useCaseCodes":["UC-04"],"source":"UC-04 business rule","isAssumption":false},{"code":"FR-17","type":"FR","statement":"The system shall allow Administrator to discontinue a product.","priority":"Low","useCaseCodes":["UC-05"],"source":"UC-05 main flow","isAssumption":false},{"code":"FR-18","type":"FR","statement":"The system shall ensure that: Ask for confirmation before discontinuing.","priority":"Medium","useCaseCodes":["UC-05"],"source":"UC-05 business rule","isAssumption":false},{"code":"FR-19","type":"FR","statement":"The system shall ensure that: Discontinued products are not shown on the website.","priority":"Medium","useCaseCodes":["UC-05"],"source":"UC-05 business rule","isAssumption":false},{"code":"FR-20","type":"FR","statement":"The system shall validate the input data of \"Discontinue a product\" and show a clear error on each invalid field.","priority":"Medium","useCaseCodes":["UC-05"],"source":"UC-05 E1","isAssumption":false},{"code":"NFR-01","type":"NFR","statement":"Main operations shall respond within 2 seconds with 100 concurrent users.","priority":"Medium","useCaseCodes":["UC-01","UC-02","UC-03","UC-04","UC-05"],"source":"SRS section 4 – default suggestion","isAssumption":true},{"code":"NFR-02","type":"NFR","statement":"Every function shall require authentication and role-based authorisation.","priority":"High","useCaseCodes":["UC-01","UC-02","UC-03","UC-04","UC-05"],"source":"SRS section 4 – default suggestion","isAssumption":true},{"code":"NFR-03","type":"NFR","statement":"The system shall log who performed each data-changing operation and when.","priority":"Medium","useCaseCodes":["UC-01","UC-02","UC-03","UC-04","UC-05"],"source":"SRS section 4 – default suggestion","isAssumption":true},{"code":"NFR-04","type":"NFR","statement":"The system shall be available 99.5% of the time during business hours.","priority":"Low","useCaseCodes":["UC-01","UC-02","UC-03","UC-04","UC-05"],"source":"SRS section 4 – default suggestion","isAssumption":true}]
## Data fields and constraints
[{"screen":"Product List","fields":[{"nodeId":"n_d5boitij3","label":"Search","name":"keyword","kind":"Input","inputType":"text","required":false,"constraints":[]},{"nodeId":"n_d5boegl54","label":"Category","name":"category","kind":"Select","inputType":"select","required":false,"constraints":[],"options":["All"]},{"nodeId":"n_d5bo59mj5","label":"Status","name":"status","kind":"Select","inputType":"select","required":false,"constraints":[],"options":["All"]}]},{"screen":"Add Product","fields":[{"nodeId":"n_d5c0j3qza","label":"Product name","name":"product_name","kind":"Input","inputType":"text","required":true,"constraints":["maxLength=100"]},{"nodeId":"n_d5c04897b","label":"SKU","name":"sku","kind":"Input","inputType":"text","required":true,"constraints":["maxLength=100"]},{"nodeId":"n_d5c0meipc","label":"Category","name":"category","kind":"Select","inputType":"select","required":true,"constraints":[],"options":["Type 1","Type 2","Type 3"]},{"nodeId":"n_d5c0c2fgd","label":"Price","name":"price","kind":"Input","inputType":"number","required":true,"constraints":["maxLength=100","numbers only"]},{"nodeId":"n_d5c05ecle","label":"Stock","name":"stock","kind":"Input","inputType":"number","required":true,"constraints":["maxLength=100","numbers only"]},{"nodeId":"n_d5c0xk8zf","label":"Description","name":"description","kind":"Textarea","inputType":"textarea","required":true,"constraints":["maxLength=100"]}]},{"screen":"Category Management","fields":[{"nodeId":"n_d5c9vd2bj","label":"Search","name":"keyword","kind":"Input","inputType":"text","required":false,"constraints":[]}]}]', '[{"code":"TC-001","title":"Search products by name or SKU – main flow succeeds","type":"Positive","priority":"High","useCaseCode":"UC-01","flowRef":"main","requirementCodes":["FR-01"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Selects the \"Search products by name or SKU\" function","Enters or selects the search criteria"],"expected":"Goal achieved: I can check stock before restocking"},{"code":"TC-002","title":"Search products by name or SKU – User cancels the operation","type":"Positive","priority":"Medium","useCaseCode":"UC-01","flowRef":"A1","requirementCodes":["FR-01"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Administrator selects Cancel"],"expected":"System closes the screen without saving changes"},{"code":"TC-003","title":"Search products by name or SKU – No matching data","type":"Negative","priority":"High","useCaseCode":"UC-01","flowRef":"E1","requirementCodes":["FR-01"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"Simulate a server error","steps":["Selects the \"Search products by name or SKU\" function","Enters or selects the search criteria"],"expected":"System displays the message \"No matching data found\""},{"code":"TC-004","title":"Add a new product with name, SKU, category, price and stock – main flow succeeds","type":"Positive","priority":"High","useCaseCode":"UC-02","flowRef":"main","requirementCodes":["FR-05"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Selects the \"Add a new product with name, SKU, category, price and stock\" function","Enters or selects the required information and confirms"],"expected":"Goal achieved: the product can go on sale on the website"},{"code":"TC-005","title":"Add a new product with name, SKU, category, price and stock – User cancels the operation","type":"Positive","priority":"Medium","useCaseCode":"UC-02","flowRef":"A1","requirementCodes":["FR-05"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Administrator selects Cancel"],"expected":"System closes the screen without saving changes"},{"code":"TC-006","title":"Add a new product with name, SKU, category, price and stock – Invalid data","type":"Negative","priority":"High","useCaseCode":"UC-02","flowRef":"E1","requirementCodes":["FR-05"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"Simulate a server error","steps":["Selects the \"Add a new product with name, SKU, category, price and stock\" function","Enters or selects the required information and confirms"],"expected":"System shows an error on the invalid field; Return to step 3"},{"code":"TC-007","title":"Add a new product with name, SKU, category, price and stock – System error while saving","type":"Negative","priority":"High","useCaseCode":"UC-02","flowRef":"E2","requirementCodes":["FR-05"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"Simulate a server error","steps":["Selects the \"Add a new product with name, SKU, category, price and stock\" function","Enters or selects the required information and confirms"],"expected":"System reports that saving failed and keeps the entered data"},{"code":"TC-008","title":"Edit the price and stock of a product – main flow succeeds","type":"Positive","priority":"High","useCaseCode":"UC-03","flowRef":"main","requirementCodes":["FR-10"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Selects the \"Edit the price and stock of a product\" function","Enters or selects the required information and confirms"],"expected":"Goal achieved: the information on the website is always correct"},{"code":"TC-009","title":"Edit the price and stock of a product – User cancels the operation","type":"Positive","priority":"Medium","useCaseCode":"UC-03","flowRef":"A1","requirementCodes":["FR-10"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Administrator selects Cancel"],"expected":"System closes the screen without saving changes"},{"code":"TC-010","title":"Edit the price and stock of a product – Invalid data","type":"Negative","priority":"High","useCaseCode":"UC-03","flowRef":"E1","requirementCodes":["FR-10"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"Simulate a server error","steps":["Selects the \"Edit the price and stock of a product\" function","Enters or selects the required information and confirms"],"expected":"System shows an error on the invalid field; Return to step 3"},{"code":"TC-011","title":"Edit the price and stock of a product – System error while saving","type":"Negative","priority":"High","useCaseCode":"UC-03","flowRef":"E2","requirementCodes":["FR-10"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"Simulate a server error","steps":["Selects the \"Edit the price and stock of a product\" function","Enters or selects the required information and confirms"],"expected":"System reports that saving failed and keeps the entered data"},{"code":"TC-012","title":"Filter products by category and status – main flow succeeds","type":"Positive","priority":"High","useCaseCode":"UC-04","flowRef":"main","requirementCodes":["FR-14"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Selects the \"Filter products by category and status\" function","Enters or selects the search criteria"],"expected":"Goal achieved: I can review prices for each product group"},{"code":"TC-013","title":"Filter products by category and status – User cancels the operation","type":"Positive","priority":"Medium","useCaseCode":"UC-04","flowRef":"A1","requirementCodes":["FR-14"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Administrator selects Cancel"],"expected":"System closes the screen without saving changes"},{"code":"TC-014","title":"Filter products by category and status – No matching data","type":"Negative","priority":"High","useCaseCode":"UC-04","flowRef":"E1","requirementCodes":["FR-14"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"Simulate a server error","steps":["Selects the \"Filter products by category and status\" function","Enters or selects the search criteria"],"expected":"System displays the message \"No matching data found\""},{"code":"TC-015","title":"Discontinue a product – main flow succeeds","type":"Positive","priority":"High","useCaseCode":"UC-05","flowRef":"main","requirementCodes":["FR-17"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Selects the \"Discontinue a product\" function","Enters or selects the required information and confirms"],"expected":"Goal achieved: customers cannot order discontinued items"},{"code":"TC-016","title":"Discontinue a product – User cancels the operation","type":"Positive","priority":"Medium","useCaseCode":"UC-05","flowRef":"A1","requirementCodes":["FR-17"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Administrator selects Cancel"],"expected":"System closes the screen without saving changes"},{"code":"TC-017","title":"Discontinue a product – Invalid data","type":"Negative","priority":"High","useCaseCode":"UC-05","flowRef":"E1","requirementCodes":["FR-17"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"Simulate a server error","steps":["Selects the \"Discontinue a product\" function","Enters or selects the required information and confirms"],"expected":"System shows an error on the invalid field; Return to step 3"},{"code":"TC-018","title":"Discontinue a product – System error while saving","type":"Negative","priority":"High","useCaseCode":"UC-05","flowRef":"E2","requirementCodes":["FR-17"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"Simulate a server error","steps":["Selects the \"Discontinue a product\" function","Enters or selects the required information and confirms"],"expected":"System reports that saving failed and keeps the entered data"},{"code":"TC-019","title":"FR-02 – The system shall ensure that: Search matches part of the name, case-insensitive.","type":"Positive","priority":"Medium","useCaseCode":"UC-01","flowRef":"main","requirementCodes":["FR-02"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-02","Observe the result returned by the system"],"expected":"The system shall ensure that: Search matches part of the name, case-insensitive."},{"code":"TC-020","title":"FR-03 – The system shall ensure that: When there are no results, show the message ''No…","type":"Positive","priority":"Medium","useCaseCode":"UC-01","flowRef":"main","requirementCodes":["FR-03"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-03","Observe the result returned by the system"],"expected":"The system shall ensure that: When there are no results, show the message ''No products found''."},{"code":"TC-021","title":"FR-04 – The system shall ensure that: Results are paginated at 20 rows per page.","type":"Positive","priority":"Medium","useCaseCode":"UC-01","flowRef":"main","requirementCodes":["FR-04"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-04","Observe the result returned by the system"],"expected":"The system shall ensure that: Results are paginated at 20 rows per page."},{"code":"TC-022","title":"FR-06 – The system shall ensure that: Product name is required, up to 100 characters.","type":"Positive","priority":"Medium","useCaseCode":"UC-02","flowRef":"main","requirementCodes":["FR-06"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-06","Observe the result returned by the system"],"expected":"The system shall ensure that: Product name is required, up to 100 characters."},{"code":"TC-023","title":"FR-07 – The system shall ensure that: SKU must be unique.","type":"Positive","priority":"Medium","useCaseCode":"UC-02","flowRef":"main","requirementCodes":["FR-07"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-07","Observe the result returned by the system"],"expected":"The system shall ensure that: SKU must be unique."},{"code":"TC-024","title":"FR-08 – The system shall ensure that: Price must be greater than 0.","type":"Positive","priority":"Medium","useCaseCode":"UC-02","flowRef":"main","requirementCodes":["FR-08"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-08","Observe the result returned by the system"],"expected":"The system shall ensure that: Price must be greater than 0."},{"code":"TC-025","title":"FR-09 – The system shall validate the input data of \"Add a new product with name, SKU…","type":"Positive","priority":"Medium","useCaseCode":"UC-02","flowRef":"main","requirementCodes":["FR-09"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-09","Observe the result returned by the system"],"expected":"The system shall validate the input data of \"Add a new product with name, SKU, category, price and stock\" and show a clear error on each invalid field."},{"code":"TC-026","title":"FR-11 – The system shall ensure that: On successful save, show a confirmation and ref…","type":"Positive","priority":"Medium","useCaseCode":"UC-03","flowRef":"main","requirementCodes":["FR-11"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-11","Observe the result returned by the system"],"expected":"The system shall ensure that: On successful save, show a confirmation and refresh the list."},{"code":"TC-027","title":"FR-12 – The system shall ensure that: Stock cannot be negative.","type":"Positive","priority":"Medium","useCaseCode":"UC-03","flowRef":"main","requirementCodes":["FR-12"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-12","Observe the result returned by the system"],"expected":"The system shall ensure that: Stock cannot be negative."},{"code":"TC-028","title":"FR-13 – The system shall validate the input data of \"Edit the price and stock of a pr…","type":"Positive","priority":"Medium","useCaseCode":"UC-03","flowRef":"main","requirementCodes":["FR-13"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-13","Observe the result returned by the system"],"expected":"The system shall validate the input data of \"Edit the price and stock of a product\" and show a clear error on each invalid field."},{"code":"TC-029","title":"FR-15 – The system shall ensure that: Filters can be combined with the search box.","type":"Positive","priority":"Medium","useCaseCode":"UC-04","flowRef":"main","requirementCodes":["FR-15"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-15","Observe the result returned by the system"],"expected":"The system shall ensure that: Filters can be combined with the search box."},{"code":"TC-030","title":"FR-16 – The system shall ensure that: There is an ''All categories'' option.","type":"Positive","priority":"Medium","useCaseCode":"UC-04","flowRef":"main","requirementCodes":["FR-16"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-16","Observe the result returned by the system"],"expected":"The system shall ensure that: There is an ''All categories'' option."},{"code":"TC-031","title":"FR-18 – The system shall ensure that: Ask for confirmation before discontinuing.","type":"Positive","priority":"Medium","useCaseCode":"UC-05","flowRef":"main","requirementCodes":["FR-18"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-18","Observe the result returned by the system"],"expected":"The system shall ensure that: Ask for confirmation before discontinuing."},{"code":"TC-032","title":"FR-19 – The system shall ensure that: Discontinued products are not shown on the webs…","type":"Positive","priority":"Medium","useCaseCode":"UC-05","flowRef":"main","requirementCodes":["FR-19"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-19","Observe the result returned by the system"],"expected":"The system shall ensure that: Discontinued products are not shown on the website."},{"code":"TC-033","title":"FR-20 – The system shall validate the input data of \"Discontinue a product\" and show …","type":"Positive","priority":"Medium","useCaseCode":"UC-05","flowRef":"main","requirementCodes":["FR-20"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-20","Observe the result returned by the system"],"expected":"The system shall validate the input data of \"Discontinue a product\" and show a clear error on each invalid field."}]', 1, '', 0, 0, 1, '2026-10-21T02:15:54.493Z');
INSERT INTO "prompt_runs" ("id", "module_id", "type", "provider", "model", "input", "output", "ok", "error", "input_tokens", "output_tokens", "latency_ms", "created_at") VALUES ('faedadee-f730-4513-971c-03c14110bfc3', 'demo-mod-products', 'generate_diagram_context', 'mock', 'rule-based', 'Build the context diagram for system/module "Product Management" (project "Electronics Store (sample)").
- system: name of the system in the centre.
- externals: actors (kind "actor": people, organisations) and external systems (kind "system") that interact with the system.
- flows: data flows between the system and each external party; from/to is a name from externals or "SYSTEM" (the system in the centre). Every external party has at least 1 flow.

## BRD
# BRD – Product Management

## 1. Background and Objectives

Module **Product Management** is built to satisfy 5 user stories from: Administrator.

Business objectives:
- I can check stock before restocking (US-01)
- The product can go on sale on the website (US-02)
- The information on the website is always correct (US-03)
- I can review prices for each product group (US-04)
- Customers cannot order discontinued items (US-05)

## 2. Scope

### In Scope
- Search products by name or SKU (US-01)
- Add a new product with name, SKU, category, price and stock (US-02)
- Edit the price and stock of a product (US-03)
- Filter products by category and status (US-04)
- Discontinue a product (US-05)

### Out of Scope
- Features not listed in the module''s user stories (any addition must be confirmed by the BA).
- Integration with external systems that have not been described.

## 3. Stakeholders

| Stakeholder | Role | Related stories |
|---|---|---|
| Administrator | Direct user of the feature | US-01, US-02, US-03, US-04, US-05 |
| BA Lead / Product Owner | Approves requirements and performs acceptance | All |

## 4. Business Requirements

| ID | Business requirement | Benefit | Priority | Story |
|---|---|---|---|---|
| BR-01 | Administrator can search products by name or SKU | I can check stock before restocking | High | US-01 |
| BR-02 | Administrator can add a new product with name, SKU, category, price and stock | The product can go on sale on the website | High | US-02 |
| BR-03 | Administrator can edit the price and stock of a product | The information on the website is always correct | Medium | US-03 |
| BR-04 | Administrator can filter products by category and status | I can review prices for each product group | Medium | US-04 |
| BR-05 | Administrator can discontinue a product | Customers cannot order discontinued items | Low | US-05 |

## 5. Acceptance Criteria

### US-01 – Search products by name or SKU
- Search matches part of the name, case-insensitive
- When there are no results, show the message ''No products found''
- Results are paginated at 20 rows per page

### US-02 – Add a new product with name, SKU, category, price and stock
- Product name is required, up to 100 characters
- SKU must be unique
- Price must be greater than 0

### US-03 – Edit the price and stock of a product
- On successful save, show a confirmation and refresh the list
- Stock cannot be negative

### US-04 – Filter products by category and status
- Filters can be combined with the search box
- There is an ''All categories'' option

### US-05 – Discontinue a product
- Ask for confirmation before discontinuing
- Discontinued products are not shown on the website

## 6. Assumptions and Constraints

- Users have been given an account and the appropriate permissions before using the feature.
- Content is derived from the user stories; unclear points must be confirmed by the BA with the stakeholders.


## User stories
- US-01: As a administrator, I want search products by name or SKU, so that I can check stock before restocking
- US-02: As a administrator, I want add a new product with name, SKU, category, price and stock, so that the product can go on sale on the website
- US-03: As a administrator, I want edit the price and stock of a product, so that the information on the website is always correct
- US-04: As a administrator, I want filter products by category and status, so that I can review prices for each product group
- US-05: As a administrator, I want discontinue a product, so that customers cannot order discontinued items', '{"code":"flowchart LR\n  %% diagram: CONTEXT – system in the centre, actors (rounded rectangles), external systems (double boxes)\n  SYS((\"Product Management\"))\n  ACT1(\"Administrator\")\n  ACT2(\"BA Lead / Product Owner\")\n  ACT1 -->|\"search products by name or SKU\"| SYS\n  SYS -->|\"Results, notifications\"| ACT1\n  ACT2 -->|\"Requests, input data\"| SYS\n  SYS -->|\"Results, notifications\"| ACT2","parts":[]}', 1, '', 0, 0, 7, '2026-10-21T02:25:32.726Z');

-- Bảng requirements
CREATE TABLE requirements (
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE, code TEXT NOT NULL, ord INTEGER NOT NULL,
  data TEXT NOT NULL, PRIMARY KEY (module_id, code)
);

-- Bảng screen_versions
CREATE TABLE screen_versions (
  id TEXT PRIMARY KEY, screen_id TEXT NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
  number INTEGER NOT NULL, kind TEXT NOT NULL, prompt TEXT NOT NULL DEFAULT '', scope TEXT NOT NULL DEFAULT '',
  selected_ids TEXT NOT NULL DEFAULT '[]', changed_ids TEXT NOT NULL DEFAULT '[]', rejected TEXT NOT NULL DEFAULT '[]',
  tree TEXT NOT NULL, created_at TEXT NOT NULL
, author TEXT NOT NULL DEFAULT '', author_id TEXT REFERENCES members(id) ON DELETE SET NULL);
INSERT INTO "screen_versions" ("id", "screen_id", "number", "kind", "prompt", "scope", "selected_ids", "changed_ids", "rejected", "tree", "created_at", "author", "author_id") VALUES ('13dd97ac-c8bc-4d2f-9495-3c2b44111b5f', '2f006e4d-be45-4566-826e-bc35cdc80681', 1, 'generate', 'Product management: search by name or SKU, filter by category and status, a list table with columns Code, Product name, Price, Stock, Status, view/edit/delete actions, an Add new button and pagination.', '', '[]', '[]', '[]', '{"id":"page","type":"Page","props":{"title":"Product List"},"children":[{"id":"n_d5bo4w011","type":"Heading","props":{"text":"Product List","level":1}},{"id":"n_d5bo18bx2","type":"Row","props":{"gap":8,"align":"between"},"children":[{"id":"n_d5boitij3","type":"Input","props":{"label":"Search","name":"keyword","placeholder":"Enter keywords..."}},{"id":"n_d5boegl54","type":"Select","props":{"label":"Category","name":"category","options":["All"]}},{"id":"n_d5bo59mj5","type":"Select","props":{"label":"Status","name":"status","options":["All"]}},{"id":"btn_create","type":"Button","props":{"label":"Add new","variant":"primary","action":"create"}}]},{"id":"n_d5bo08hg6","type":"Table","props":{"columns":["Code","Product name","Price","Stock","Status","View","Edit","Delete actions","An Add new button","Pagination","Actions"],"rows":[],"rowActions":["View","Edit","Delete"]}},{"id":"n_d5bomgqm7","type":"Pagination","props":{"pages":5}}]}', '2026-10-21T02:15:54.424Z', 'Duc Tran', 'demo-mem-duc');
INSERT INTO "screen_versions" ("id", "screen_id", "number", "kind", "prompt", "scope", "selected_ids", "changed_ids", "rejected", "tree", "created_at", "author", "author_id") VALUES ('41ebbd33-6e45-480c-bdd9-ad6b4b721d1e', 'efb6f8ee-f468-4a65-b7f7-401fb409e23f', 1, 'generate', 'Add product form: product name (required, up to 100 characters), SKU, category, price, stock, description; Save and Cancel buttons.', '', '[]', '[]', '[]', '{"id":"page","type":"Page","props":{"title":"Add Product"},"children":[{"id":"n_d5c03e3l8","type":"Heading","props":{"text":"Add Product","level":1}},{"id":"n_d5c0hyxe9","type":"Form","props":{"submitAction":"save"},"children":[{"id":"n_d5c0j3qza","type":"Input","props":{"label":"Product name","name":"product_name","placeholder":"Enter product name","required":true,"maxLength":100}},{"id":"n_d5c04897b","type":"Input","props":{"label":"SKU","name":"sku","placeholder":"Enter sku","required":true,"maxLength":100}},{"id":"n_d5c0meipc","type":"Select","props":{"label":"Category","options":["Type 1","Type 2","Type 3"],"name":"category","required":true}},{"id":"n_d5c0c2fgd","type":"Input","props":{"label":"Price","inputType":"number","name":"price","placeholder":"Enter price","required":true,"maxLength":100}},{"id":"n_d5c05ecle","type":"Input","props":{"label":"Stock","inputType":"number","name":"stock","placeholder":"Enter stock","required":true,"maxLength":100}},{"id":"n_d5c0xk8zf","type":"Textarea","props":{"label":"Description","name":"description","placeholder":"Enter description","required":true,"maxLength":100}},{"id":"n_d5c0iw1jg","type":"Row","props":{"gap":8,"align":"end"},"children":[{"id":"btn_save","type":"Button","props":{"label":"Save","variant":"primary","action":"save"}},{"id":"btn_cancel","type":"Button","props":{"label":"Cancel","variant":"secondary","action":"cancel"}}]}]}]}', '2026-10-21T02:15:54.435Z', 'Duc Tran', 'demo-mem-duc');
INSERT INTO "screen_versions" ("id", "screen_id", "number", "kind", "prompt", "scope", "selected_ids", "changed_ids", "rejected", "tree", "created_at", "author", "author_id") VALUES ('282ff6e0-9059-48d4-a374-2fb8a65e0e71', '3581d25c-8b41-41fc-854d-3d7efac27c9f', 1, 'generate', 'Category management: search by name, a list table with columns Code, Category name, Number of products, edit/delete actions and an Add new button.', '', '[]', '[]', '[]', '{"id":"page","type":"Page","props":{"title":"Category Management"},"children":[{"id":"n_d5c9hwaqh","type":"Heading","props":{"text":"Category Management","level":1}},{"id":"n_d5c9jzxxi","type":"Row","props":{"gap":8,"align":"between"},"children":[{"id":"n_d5c9vd2bj","type":"Input","props":{"label":"Search","name":"keyword","placeholder":"Enter keywords..."}},{"id":"btn_create","type":"Button","props":{"label":"Add new","variant":"primary","action":"create"}}]},{"id":"n_d5c9ak2gk","type":"Table","props":{"columns":["Code","Category name","Number of products","Edit","Delete actions","An Add new button","Actions"],"rows":[],"rowActions":["Edit","Delete"]}},{"id":"n_d5c9igahl","type":"Row","props":{"gap":8},"children":[{"id":"n_d5c9ts2bm","type":"Button","props":{"label":"Edit","variant":"primary","action":"click"}},{"id":"btn_delete","type":"Button","props":{"label":"Delete actions","variant":"primary","action":"delete"}}]}]}', '2026-10-21T02:15:54.444Z', 'Anh Le', 'demo-mem-anh');

-- Bảng screens
CREATE TABLE screens (
  id TEXT PRIMARY KEY, module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', current_version_id TEXT, created_at TEXT NOT NULL
, rev INTEGER NOT NULL DEFAULT 1, revision_requested INTEGER NOT NULL DEFAULT 0, updated_by TEXT REFERENCES members(id) ON DELETE SET NULL, updated_at TEXT);
INSERT INTO "screens" ("id", "module_id", "name", "status", "current_version_id", "created_at", "rev", "revision_requested", "updated_by", "updated_at") VALUES ('2f006e4d-be45-4566-826e-bc35cdc80681', 'demo-mod-products', 'Product List', 'approved', '13dd97ac-c8bc-4d2f-9495-3c2b44111b5f', '2026-10-21T02:15:54.423Z', 1, 0, 'demo-mem-duc', '2026-10-21T02:15:54.423Z');
INSERT INTO "screens" ("id", "module_id", "name", "status", "current_version_id", "created_at", "rev", "revision_requested", "updated_by", "updated_at") VALUES ('efb6f8ee-f468-4a65-b7f7-401fb409e23f', 'demo-mod-products', 'Add Product', 'done', '41ebbd33-6e45-480c-bdd9-ad6b4b721d1e', '2026-10-21T02:15:54.435Z', 1, 0, 'demo-mem-duc', '2026-10-21T02:15:54.435Z');
INSERT INTO "screens" ("id", "module_id", "name", "status", "current_version_id", "created_at", "rev", "revision_requested", "updated_by", "updated_at") VALUES ('3581d25c-8b41-41fc-854d-3d7efac27c9f', 'demo-mod-products', 'Category Management', 'draft', '282ff6e0-9059-48d4-a374-2fb8a65e0e71', '2026-10-21T02:15:54.444Z', 1, 0, 'demo-mem-anh', '2026-10-21T02:15:54.444Z');

-- Bảng sequences
CREATE TABLE sequences (
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE, use_case_code TEXT NOT NULL, ord INTEGER NOT NULL,
  data TEXT NOT NULL, PRIMARY KEY (module_id, use_case_code)
);

-- Bảng srs
CREATE TABLE srs (
  module_id TEXT PRIMARY KEY REFERENCES modules(id) ON DELETE CASCADE, data TEXT NOT NULL
);

-- Bảng suggestion_dismissals
CREATE TABLE suggestion_dismissals (
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE, key TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (module_id, key)
);

-- Bảng suggestion_events
CREATE TABLE suggestion_events (
  id TEXT PRIMARY KEY, screen_id TEXT NOT NULL, version_id TEXT, suggestion_kind TEXT NOT NULL,
  target_node_id TEXT, title TEXT NOT NULL, confidence REAL NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('shown','applied','dismissed')), created_at TEXT NOT NULL
);

-- Bảng task_events
CREATE TABLE task_events (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_status TEXT, to_status TEXT NOT NULL,
  by_member_id TEXT REFERENCES members(id) ON DELETE SET NULL, by_system INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('73096bc5-8539-4352-9e40-b7ce51ad8792', 'c7c4e0d8-f22f-464c-8293-1630266a4790', NULL, 'todo', 'demo-mem-lan', 0, '', '2026-10-21T02:15:54.177Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('1eb11c98-7161-422c-bd26-6e4bd9bd72af', '0bb522f9-2d6e-4f84-ae8b-9c303ff889fc', NULL, 'todo', 'demo-mem-lan', 0, '', '2026-10-21T02:15:54.185Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('ec44c916-800b-4993-b19a-53b5eda861e1', 'ac20cf6f-b9af-4c02-9e19-1c21c37a0934', NULL, 'todo', 'demo-mem-lan', 0, '', '2026-10-21T02:15:54.193Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('2b3c4453-3cf3-4c44-a0ce-a9616f91a834', '92ba3c0a-e4ea-4cdc-8d68-c78f9ac48503', NULL, 'todo', 'demo-mem-lan', 0, '', '2026-10-21T02:15:54.199Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('767e17a7-86aa-48cf-a4b8-c782642c34d6', 'd91b054c-6385-4886-95d4-4d67d8e51550', NULL, 'todo', 'demo-mem-lan', 0, '', '2026-10-21T02:15:54.207Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('a131c453-8766-453f-b1fe-b150ad427182', 'e38ff20e-a565-4da1-bbd4-74c3afba755a', NULL, 'todo', 'demo-mem-lan', 0, '', '2026-10-21T02:15:54.215Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('213a9b36-db3d-47c2-8eae-4c2af9a11595', 'e715a976-764d-4050-9ddc-6779a8f9a398', NULL, 'todo', 'demo-mem-lan', 0, '', '2026-10-21T02:15:54.222Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('3e8d0fda-7b13-457a-9379-544baf1c159b', '1cbc3b84-c723-46e9-9aa9-562280e9f11b', NULL, 'todo', 'demo-mem-lan', 0, '', '2026-10-21T02:15:54.229Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('6422ea17-d56b-49f2-a974-dc20b77ff0b3', 'c7c4e0d8-f22f-464c-8293-1630266a4790', 'todo', 'doing', 'demo-mem-duc', 1, 'BRD document – Product Management has a new draft', '2026-10-21T02:15:54.249Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('04051d27-14aa-4379-b40e-e85d12e77269', 'c7c4e0d8-f22f-464c-8293-1630266a4790', 'doing', 'done', 'demo-mem-duc', 1, 'BA marked BRD document – Product Management as done', '2026-10-21T02:15:54.256Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('4b0d4ff0-2ca7-4934-9a3e-feb45b273528', '0bb522f9-2d6e-4f84-ae8b-9c303ff889fc', 'todo', 'doing', 'demo-mem-duc', 1, 'UC Specification document – Product Management has a new draft', '2026-10-21T02:15:54.270Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('ec7fda8f-9e18-4ce7-8ccf-959ba0efdd2f', '0bb522f9-2d6e-4f84-ae8b-9c303ff889fc', 'doing', 'done', 'demo-mem-duc', 1, 'BA marked UC Specification document – Product Management as done', '2026-10-21T02:15:54.278Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('eec7c438-3edb-48c0-a614-9cab2021e2c7', 'ac20cf6f-b9af-4c02-9e19-1c21c37a0934', 'todo', 'doing', 'demo-mem-anh', 1, 'SRS document – Product Management has a new draft', '2026-10-21T02:15:54.287Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('8f9f028e-cbd1-4a94-9bf5-caf37985b691', 'ac20cf6f-b9af-4c02-9e19-1c21c37a0934', 'doing', 'done', 'demo-mem-anh', 1, 'BA marked SRS document – Product Management as done', '2026-10-21T02:15:54.292Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('73b136ae-cdaf-4477-913c-aba654ad5df4', '92ba3c0a-e4ea-4cdc-8d68-c78f9ac48503', 'todo', 'doing', 'demo-mem-anh', 1, 'FRD-NFR document – Product Management has a new draft', '2026-10-21T02:15:54.301Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('a1ae8103-880b-4e56-a4b7-8a2d4fd53525', '92ba3c0a-e4ea-4cdc-8d68-c78f9ac48503', 'doing', 'done', 'demo-mem-anh', 1, 'BA marked FRD-NFR document – Product Management as done', '2026-10-21T02:15:54.305Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('54c619ca-3c79-450b-9265-20f7ab9bf5d4', 'd91b054c-6385-4886-95d4-4d67d8e51550', 'todo', 'doing', 'demo-mem-duc', 1, 'API Spec document – Product Management has a new draft', '2026-10-21T02:15:54.314Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('31ff66be-9658-461d-b3e8-94feffe95727', 'd91b054c-6385-4886-95d4-4d67d8e51550', 'doing', 'done', 'demo-mem-duc', 1, 'BA marked API Spec document – Product Management as done', '2026-10-21T02:15:54.318Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('80f7c3e0-c4f3-444c-9e7f-66c191e5c939', 'e38ff20e-a565-4da1-bbd4-74c3afba755a', 'todo', 'doing', 'demo-mem-anh', 1, 'Context diagram – Product Management has a new draft', '2026-10-21T02:15:54.333Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('d3585514-9347-47bf-932f-84e53f3a835a', 'e715a976-764d-4050-9ddc-6779a8f9a398', 'todo', 'doing', 'demo-mem-anh', 1, 'BPMN diagram – Product Management has a new draft', '2026-10-21T02:15:54.362Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('fc80edb9-6e39-424f-956a-e444ecf54696', '1cbc3b84-c723-46e9-9aa9-562280e9f11b', 'todo', 'doing', 'demo-mem-duc', 1, 'ERD diagram – Product Management has a new draft', '2026-10-21T02:15:54.372Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('10964c2f-9bda-41be-b88d-d79a49c80eaf', 'e38ff20e-a565-4da1-bbd4-74c3afba755a', 'doing', 'done', 'demo-mem-anh', 1, 'BA marked Context diagram – Product Management as done', '2026-10-21T02:15:54.376Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('589356fd-ab8e-4bfa-9f4e-a972b0f34f5c', 'e715a976-764d-4050-9ddc-6779a8f9a398', 'doing', 'done', 'demo-mem-anh', 1, 'BA marked BPMN diagram – Product Management as done', '2026-10-21T02:15:54.394Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('16504a5b-dc7d-41e5-af32-64fd84ec2fda', 'e38ff20e-a565-4da1-bbd4-74c3afba755a', 'done', 'approved', 'demo-mem-lan', 1, 'BA Lead approved Context diagram – Product Management', '2026-10-21T02:15:54.404Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('5333a78f-10a9-42f5-987f-2e6345038646', '89ecb317-3b97-42f5-ab90-8fed4a4f300b', NULL, 'todo', 'demo-mem-lan', 0, '', '2026-10-21T02:15:54.454Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('4cffd4e5-738f-45a1-91f5-0f7ea7e8fb8b', '97932e49-ca21-4897-87d5-d931f5341e54', NULL, 'todo', 'demo-mem-lan', 0, '', '2026-10-21T02:15:54.458Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('e97025ea-360c-41ba-bb30-9e60ba5966c0', '89ecb317-3b97-42f5-ab90-8fed4a4f300b', 'todo', 'doing', 'demo-mem-duc', 0, '', '2026-10-21T02:15:54.462Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('aa423791-d976-4a94-a5e9-7a43cec836c9', '97932e49-ca21-4897-87d5-d931f5341e54', 'todo', 'doing', 'demo-mem-duc', 0, '', '2026-10-21T02:15:54.466Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('65fb9812-c73d-4fb9-9c66-e41de9fd40ed', '89ecb317-3b97-42f5-ab90-8fed4a4f300b', 'doing', 'done', 'demo-mem-duc', 1, 'BA marked Screen “Product List” as done', '2026-10-21T02:15:54.470Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('1a427c58-30df-40f1-835b-9d726f6b6bc3', '89ecb317-3b97-42f5-ab90-8fed4a4f300b', 'done', 'approved', 'demo-mem-lan', 1, 'BA Lead approved Screen “Product List”', '2026-10-21T02:15:54.476Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('dd658088-4068-46cb-a993-86c370394e7e', '97932e49-ca21-4897-87d5-d931f5341e54', 'doing', 'done', 'demo-mem-duc', 1, 'BA marked Screen “Add Product” as done', '2026-10-21T02:15:54.481Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('14d97435-9d34-4a92-b60c-b3f9e8eeb390', '675aeedc-7abb-4f7a-9b95-9f032438e19e', NULL, 'todo', 'demo-mem-lan', 0, '', '2026-10-21T02:15:54.485Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('f75f1107-3266-44d6-aee9-bf48481ec229', '675aeedc-7abb-4f7a-9b95-9f032438e19e', 'todo', 'doing', 'demo-mem-anh', 1, 'Test suite – Product Management was generated', '2026-10-21T02:15:54.497Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('e64bda2c-f252-4330-bb7f-8ca6058b74a2', '675aeedc-7abb-4f7a-9b95-9f032438e19e', 'doing', 'done', 'demo-mem-anh', 1, 'BA marked Test suite – Product Management as done', '2026-10-21T02:15:54.502Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('20e13ae2-6ee3-49ab-be38-85a7a8ba1085', 'c7c4e0d8-f22f-464c-8293-1630266a4790', 'done', 'approved', 'demo-mem-lan', 1, 'BA Lead approved BRD document – Product Management', '2026-10-21T02:15:54.507Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('5d269e55-f008-4d98-a02e-f065238709fd', '0bb522f9-2d6e-4f84-ae8b-9c303ff889fc', 'done', 'approved', 'demo-mem-lan', 1, 'BA Lead approved UC Specification document – Product Management', '2026-10-21T02:15:54.513Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('704af41f-a5b8-4521-8fa0-8c56e1f3b2aa', 'd91b054c-6385-4886-95d4-4d67d8e51550', 'done', 'doing', 'demo-mem-lan', 1, 'BA Lead requested changes to API Spec document – Product Management', '2026-10-21T02:15:54.521Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('7653d1cf-33c0-4cc5-a64b-5241e3192e90', '998dd021-791b-420e-a403-b57791490c21', NULL, 'todo', 'demo-mem-lan', 0, '', '2026-10-21T02:15:54.526Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('633b0abd-cf31-4944-a07e-a145e14bf6b2', 'df2c8366-20b1-42fc-a638-c7e39bcaa88e', NULL, 'todo', 'demo-mem-lan', 0, '', '2026-10-21T02:15:54.530Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('e3661793-3e5d-40df-9eed-408c88b5e395', '908be17c-ddca-4e8b-9d53-5feb8e4ec4ab', NULL, 'todo', 'demo-mem-lan', 0, '', '2026-10-21T02:15:54.535Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('320bcd15-021a-4a7d-8150-966d838e970a', 'df2c8366-20b1-42fc-a638-c7e39bcaa88e', 'todo', 'doing', 'demo-mem-duc', 0, '', '2026-10-21T02:15:54.539Z');
INSERT INTO "task_events" ("id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at") VALUES ('a0348e4f-8e4f-4a80-b426-0f33313f7056', 'e38ff20e-a565-4da1-bbd4-74c3afba755a', 'approved', 'doing', 'demo-mem-lan', 1, 'Context diagram – Product Management has a new draft', '2026-10-21T02:25:32.748Z');

-- Bảng tasks
CREATE TABLE "tasks" (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  module_id TEXT REFERENCES modules(id) ON DELETE SET NULL,
  title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  assignee_id TEXT REFERENCES members(id) ON DELETE SET NULL,
  due_date TEXT, priority TEXT NOT NULL DEFAULT 'Medium' CHECK(priority IN ('High','Medium','Low')),
  status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','doing','done','approved','redo')),
  revision_requested INTEGER NOT NULL DEFAULT 0,
  artifact_type TEXT CHECK(artifact_type IN ('screen','doc','diagram','tests','docs')), artifact_id TEXT, artifact_sub TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
INSERT INTO "tasks" ("id", "project_id", "module_id", "title", "description", "assignee_id", "due_date", "priority", "status", "revision_requested", "artifact_type", "artifact_id", "artifact_sub", "created_at", "updated_at") VALUES ('c7c4e0d8-f22f-464c-8293-1630266a4790', 'demo-shop', 'demo-mod-products', 'Write the BRD', 'Generate and review the BRD of the Product Management module, then mark it as done for BA Lead approval.', 'demo-mem-duc', '2026-10-17', 'High', 'approved', 0, 'doc', 'demo-mod-products', 'BRD', '2026-10-21T02:15:54.177Z', '2026-10-21T02:15:54.507Z');
INSERT INTO "tasks" ("id", "project_id", "module_id", "title", "description", "assignee_id", "due_date", "priority", "status", "revision_requested", "artifact_type", "artifact_id", "artifact_sub", "created_at", "updated_at") VALUES ('0bb522f9-2d6e-4f84-ae8b-9c303ff889fc', 'demo-shop', 'demo-mod-products', 'Write the UC Specification', 'Generate and review the UC Specification of the Product Management module, then mark it as done for BA Lead approval.', 'demo-mem-duc', '2026-10-19', 'High', 'approved', 0, 'doc', 'demo-mod-products', 'UC_SPEC', '2026-10-21T02:15:54.185Z', '2026-10-21T02:15:54.513Z');
INSERT INTO "tasks" ("id", "project_id", "module_id", "title", "description", "assignee_id", "due_date", "priority", "status", "revision_requested", "artifact_type", "artifact_id", "artifact_sub", "created_at", "updated_at") VALUES ('ac20cf6f-b9af-4c02-9e19-1c21c37a0934', 'demo-shop', 'demo-mod-products', 'Write the SRS', 'Generate and review the SRS of the Product Management module, then mark it as done for BA Lead approval.', 'demo-mem-anh', '2026-10-22', 'High', 'done', 0, 'doc', 'demo-mod-products', 'SRS', '2026-10-21T02:15:54.193Z', '2026-10-21T02:15:54.292Z');
INSERT INTO "tasks" ("id", "project_id", "module_id", "title", "description", "assignee_id", "due_date", "priority", "status", "revision_requested", "artifact_type", "artifact_id", "artifact_sub", "created_at", "updated_at") VALUES ('92ba3c0a-e4ea-4cdc-8d68-c78f9ac48503', 'demo-shop', 'demo-mod-products', 'Write the FRD-NFR', 'Generate and review the FRD-NFR of the Product Management module, then mark it as done for BA Lead approval.', 'demo-mem-anh', '2026-10-23', 'High', 'done', 0, 'doc', 'demo-mod-products', 'FRD_NFR', '2026-10-21T02:15:54.199Z', '2026-10-21T02:15:54.305Z');
INSERT INTO "tasks" ("id", "project_id", "module_id", "title", "description", "assignee_id", "due_date", "priority", "status", "revision_requested", "artifact_type", "artifact_id", "artifact_sub", "created_at", "updated_at") VALUES ('d91b054c-6385-4886-95d4-4d67d8e51550', 'demo-shop', 'demo-mod-products', 'Write the API Spec', 'Generate and review the API Spec of the Product Management module, then mark it as done for BA Lead approval.', 'demo-mem-duc', '2026-10-25', 'High', 'doing', 1, 'doc', 'demo-mod-products', 'API_SPEC', '2026-10-21T02:15:54.207Z', '2026-10-21T02:15:54.521Z');
INSERT INTO "tasks" ("id", "project_id", "module_id", "title", "description", "assignee_id", "due_date", "priority", "status", "revision_requested", "artifact_type", "artifact_id", "artifact_sub", "created_at", "updated_at") VALUES ('e38ff20e-a565-4da1-bbd4-74c3afba755a', 'demo-shop', 'demo-mod-products', 'Draw the Context diagram', 'Generate with AI from the Done documents, adjust the Mermaid code if needed.', 'demo-mem-anh', '2026-10-20', 'Medium', 'doing', 0, 'diagram', 'demo-mod-products', 'CONTEXT', '2026-10-21T02:15:54.215Z', '2026-10-21T02:25:32.748Z');
INSERT INTO "tasks" ("id", "project_id", "module_id", "title", "description", "assignee_id", "due_date", "priority", "status", "revision_requested", "artifact_type", "artifact_id", "artifact_sub", "created_at", "updated_at") VALUES ('e715a976-764d-4050-9ddc-6779a8f9a398', 'demo-shop', 'demo-mod-products', 'Draw the BPMN diagram for the restocking process', 'Generate with AI from the Done documents, adjust the Mermaid code if needed.', 'demo-mem-anh', '2026-10-24', 'Medium', 'done', 0, 'diagram', 'demo-mod-products', 'BPMN', '2026-10-21T02:15:54.222Z', '2026-10-21T02:15:54.394Z');
INSERT INTO "tasks" ("id", "project_id", "module_id", "title", "description", "assignee_id", "due_date", "priority", "status", "revision_requested", "artifact_type", "artifact_id", "artifact_sub", "created_at", "updated_at") VALUES ('1cbc3b84-c723-46e9-9aa9-562280e9f11b', 'demo-shop', 'demo-mod-products', 'Draw the ERD', 'Generate with AI from the Done documents, adjust the Mermaid code if needed.', 'demo-mem-duc', '2026-10-26', 'Medium', 'doing', 0, 'diagram', 'demo-mod-products', 'ERD', '2026-10-21T02:15:54.229Z', '2026-10-21T02:15:54.372Z');
INSERT INTO "tasks" ("id", "project_id", "module_id", "title", "description", "assignee_id", "due_date", "priority", "status", "revision_requested", "artifact_type", "artifact_id", "artifact_sub", "created_at", "updated_at") VALUES ('89ecb317-3b97-42f5-ab90-8fed4a4f300b', 'demo-shop', 'demo-mod-products', 'Design the Product List screen', 'Prototype generated from the SRS, FRD-NFR and user stories.', 'demo-mem-duc', '2026-10-18', 'High', 'approved', 0, 'screen', '2f006e4d-be45-4566-826e-bc35cdc80681', NULL, '2026-10-21T02:15:54.454Z', '2026-10-21T02:15:54.476Z');
INSERT INTO "tasks" ("id", "project_id", "module_id", "title", "description", "assignee_id", "due_date", "priority", "status", "revision_requested", "artifact_type", "artifact_id", "artifact_sub", "created_at", "updated_at") VALUES ('97932e49-ca21-4897-87d5-d931f5341e54', 'demo-shop', 'demo-mod-products', 'Design the Add Product screen', 'Prototype generated from the SRS, FRD-NFR and user stories.', 'demo-mem-duc', '2026-10-23', 'High', 'done', 0, 'screen', 'efb6f8ee-f468-4a65-b7f7-401fb409e23f', NULL, '2026-10-21T02:15:54.458Z', '2026-10-21T02:15:54.481Z');
INSERT INTO "tasks" ("id", "project_id", "module_id", "title", "description", "assignee_id", "due_date", "priority", "status", "revision_requested", "artifact_type", "artifact_id", "artifact_sub", "created_at", "updated_at") VALUES ('675aeedc-7abb-4f7a-9b95-9f032438e19e', 'demo-shop', 'demo-mod-products', 'Write test cases for the Products module', 'Generate test cases from the UC Specification + FRD-NFR.', 'demo-mem-anh', '2026-10-24', 'Medium', 'done', 0, 'tests', 'demo-mod-products', NULL, '2026-10-21T02:15:54.485Z', '2026-10-21T02:15:54.502Z');
INSERT INTO "tasks" ("id", "project_id", "module_id", "title", "description", "assignee_id", "due_date", "priority", "status", "revision_requested", "artifact_type", "artifact_id", "artifact_sub", "created_at", "updated_at") VALUES ('998dd021-791b-420e-a403-b57791490c21', 'demo-shop', 'demo-mod-orders', 'Write the BRD for the Orders module', 'Generate the BRD from the 4 user stories of the Orders module.', 'demo-mem-anh', '2026-10-27', 'High', 'todo', 0, 'doc', 'demo-mod-orders', 'BRD', '2026-10-21T02:15:54.526Z', '2026-10-21T02:15:54.526Z');
INSERT INTO "tasks" ("id", "project_id", "module_id", "title", "description", "assignee_id", "due_date", "priority", "status", "revision_requested", "artifact_type", "artifact_id", "artifact_sub", "created_at", "updated_at") VALUES ('df2c8366-20b1-42fc-a638-c7e39bcaa88e', 'demo-shop', 'demo-mod-orders', 'Review the Orders stories with the sales team', 'Check the acceptance criteria against the actual in-store process.', 'demo-mem-duc', '2026-10-23', 'Medium', 'doing', 0, NULL, NULL, NULL, '2026-10-21T02:15:54.530Z', '2026-10-21T02:15:54.539Z');
INSERT INTO "tasks" ("id", "project_id", "module_id", "title", "description", "assignee_id", "due_date", "priority", "status", "revision_requested", "artifact_type", "artifact_id", "artifact_sub", "created_at", "updated_at") VALUES ('908be17c-ddca-4e8b-9d53-5feb8e4ec4ab', 'demo-shop', 'demo-mod-orders', 'Add non-functional requirements for orders', 'Order list response time, maximum number of orders per page.', 'demo-mem-duc', '2026-10-25', 'Low', 'todo', 0, NULL, NULL, NULL, '2026-10-21T02:15:54.535Z', '2026-10-21T02:15:54.535Z');

-- Bảng test_cases
CREATE TABLE test_cases (
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE, code TEXT NOT NULL, ord INTEGER NOT NULL,
  data TEXT NOT NULL, PRIMARY KEY (module_id, code)
);
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-001', 0, '{"code":"TC-001","title":"Search products by name or SKU – main flow succeeds","type":"Positive","priority":"High","useCaseCode":"UC-01","flowRef":"main","requirementCodes":["FR-01"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Selects the \"Search products by name or SKU\" function","Enters or selects the search criteria"],"expected":"Goal achieved: I can check stock before restocking"}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-002', 1, '{"code":"TC-002","title":"Search products by name or SKU – User cancels the operation","type":"Positive","priority":"Medium","useCaseCode":"UC-01","flowRef":"A1","requirementCodes":["FR-01"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Administrator selects Cancel"],"expected":"System closes the screen without saving changes"}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-003', 2, '{"code":"TC-003","title":"Search products by name or SKU – No matching data","type":"Negative","priority":"High","useCaseCode":"UC-01","flowRef":"E1","requirementCodes":["FR-01"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"Simulate a server error","steps":["Selects the \"Search products by name or SKU\" function","Enters or selects the search criteria"],"expected":"System displays the message \"No matching data found\""}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-004', 3, '{"code":"TC-004","title":"Add a new product with name, SKU, category, price and stock – main flow succeeds","type":"Positive","priority":"High","useCaseCode":"UC-02","flowRef":"main","requirementCodes":["FR-05"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Selects the \"Add a new product with name, SKU, category, price and stock\" function","Enters or selects the required information and confirms"],"expected":"Goal achieved: the product can go on sale on the website"}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-005', 4, '{"code":"TC-005","title":"Add a new product with name, SKU, category, price and stock – User cancels the operation","type":"Positive","priority":"Medium","useCaseCode":"UC-02","flowRef":"A1","requirementCodes":["FR-05"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Administrator selects Cancel"],"expected":"System closes the screen without saving changes"}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-006', 5, '{"code":"TC-006","title":"Add a new product with name, SKU, category, price and stock – Invalid data","type":"Negative","priority":"High","useCaseCode":"UC-02","flowRef":"E1","requirementCodes":["FR-05"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"Simulate a server error","steps":["Selects the \"Add a new product with name, SKU, category, price and stock\" function","Enters or selects the required information and confirms"],"expected":"System shows an error on the invalid field; Return to step 3"}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-007', 6, '{"code":"TC-007","title":"Add a new product with name, SKU, category, price and stock – System error while saving","type":"Negative","priority":"High","useCaseCode":"UC-02","flowRef":"E2","requirementCodes":["FR-05"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"Simulate a server error","steps":["Selects the \"Add a new product with name, SKU, category, price and stock\" function","Enters or selects the required information and confirms"],"expected":"System reports that saving failed and keeps the entered data"}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-008', 7, '{"code":"TC-008","title":"Edit the price and stock of a product – main flow succeeds","type":"Positive","priority":"High","useCaseCode":"UC-03","flowRef":"main","requirementCodes":["FR-10"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Selects the \"Edit the price and stock of a product\" function","Enters or selects the required information and confirms"],"expected":"Goal achieved: the information on the website is always correct"}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-009', 8, '{"code":"TC-009","title":"Edit the price and stock of a product – User cancels the operation","type":"Positive","priority":"Medium","useCaseCode":"UC-03","flowRef":"A1","requirementCodes":["FR-10"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Administrator selects Cancel"],"expected":"System closes the screen without saving changes"}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-010', 9, '{"code":"TC-010","title":"Edit the price and stock of a product – Invalid data","type":"Negative","priority":"High","useCaseCode":"UC-03","flowRef":"E1","requirementCodes":["FR-10"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"Simulate a server error","steps":["Selects the \"Edit the price and stock of a product\" function","Enters or selects the required information and confirms"],"expected":"System shows an error on the invalid field; Return to step 3"}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-011', 10, '{"code":"TC-011","title":"Edit the price and stock of a product – System error while saving","type":"Negative","priority":"High","useCaseCode":"UC-03","flowRef":"E2","requirementCodes":["FR-10"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"Simulate a server error","steps":["Selects the \"Edit the price and stock of a product\" function","Enters or selects the required information and confirms"],"expected":"System reports that saving failed and keeps the entered data"}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-012', 11, '{"code":"TC-012","title":"Filter products by category and status – main flow succeeds","type":"Positive","priority":"High","useCaseCode":"UC-04","flowRef":"main","requirementCodes":["FR-14"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Selects the \"Filter products by category and status\" function","Enters or selects the search criteria"],"expected":"Goal achieved: I can review prices for each product group"}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-013', 12, '{"code":"TC-013","title":"Filter products by category and status – User cancels the operation","type":"Positive","priority":"Medium","useCaseCode":"UC-04","flowRef":"A1","requirementCodes":["FR-14"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Administrator selects Cancel"],"expected":"System closes the screen without saving changes"}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-014', 13, '{"code":"TC-014","title":"Filter products by category and status – No matching data","type":"Negative","priority":"High","useCaseCode":"UC-04","flowRef":"E1","requirementCodes":["FR-14"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"Simulate a server error","steps":["Selects the \"Filter products by category and status\" function","Enters or selects the search criteria"],"expected":"System displays the message \"No matching data found\""}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-015', 14, '{"code":"TC-015","title":"Discontinue a product – main flow succeeds","type":"Positive","priority":"High","useCaseCode":"UC-05","flowRef":"main","requirementCodes":["FR-17"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Selects the \"Discontinue a product\" function","Enters or selects the required information and confirms"],"expected":"Goal achieved: customers cannot order discontinued items"}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-016', 15, '{"code":"TC-016","title":"Discontinue a product – User cancels the operation","type":"Positive","priority":"Medium","useCaseCode":"UC-05","flowRef":"A1","requirementCodes":["FR-17"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Administrator selects Cancel"],"expected":"System closes the screen without saving changes"}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-017', 16, '{"code":"TC-017","title":"Discontinue a product – Invalid data","type":"Negative","priority":"High","useCaseCode":"UC-05","flowRef":"E1","requirementCodes":["FR-17"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"Simulate a server error","steps":["Selects the \"Discontinue a product\" function","Enters or selects the required information and confirms"],"expected":"System shows an error on the invalid field; Return to step 3"}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-018', 17, '{"code":"TC-018","title":"Discontinue a product – System error while saving","type":"Negative","priority":"High","useCaseCode":"UC-05","flowRef":"E2","requirementCodes":["FR-17"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"Simulate a server error","steps":["Selects the \"Discontinue a product\" function","Enters or selects the required information and confirms"],"expected":"System reports that saving failed and keeps the entered data"}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-019', 18, '{"code":"TC-019","title":"FR-02 – The system shall ensure that: Search matches part of the name, case-insensitive.","type":"Positive","priority":"Medium","useCaseCode":"UC-01","flowRef":"main","requirementCodes":["FR-02"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-02","Observe the result returned by the system"],"expected":"The system shall ensure that: Search matches part of the name, case-insensitive."}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-020', 19, '{"code":"TC-020","title":"FR-03 – The system shall ensure that: When there are no results, show the message ''No…","type":"Positive","priority":"Medium","useCaseCode":"UC-01","flowRef":"main","requirementCodes":["FR-03"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-03","Observe the result returned by the system"],"expected":"The system shall ensure that: When there are no results, show the message ''No products found''."}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-021', 20, '{"code":"TC-021","title":"FR-04 – The system shall ensure that: Results are paginated at 20 rows per page.","type":"Positive","priority":"Medium","useCaseCode":"UC-01","flowRef":"main","requirementCodes":["FR-04"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-04","Observe the result returned by the system"],"expected":"The system shall ensure that: Results are paginated at 20 rows per page."}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-022', 21, '{"code":"TC-022","title":"FR-06 – The system shall ensure that: Product name is required, up to 100 characters.","type":"Positive","priority":"Medium","useCaseCode":"UC-02","flowRef":"main","requirementCodes":["FR-06"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-06","Observe the result returned by the system"],"expected":"The system shall ensure that: Product name is required, up to 100 characters."}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-023', 22, '{"code":"TC-023","title":"FR-07 – The system shall ensure that: SKU must be unique.","type":"Positive","priority":"Medium","useCaseCode":"UC-02","flowRef":"main","requirementCodes":["FR-07"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-07","Observe the result returned by the system"],"expected":"The system shall ensure that: SKU must be unique."}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-024', 23, '{"code":"TC-024","title":"FR-08 – The system shall ensure that: Price must be greater than 0.","type":"Positive","priority":"Medium","useCaseCode":"UC-02","flowRef":"main","requirementCodes":["FR-08"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-08","Observe the result returned by the system"],"expected":"The system shall ensure that: Price must be greater than 0."}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-025', 24, '{"code":"TC-025","title":"FR-09 – The system shall validate the input data of \"Add a new product with name, SKU…","type":"Positive","priority":"Medium","useCaseCode":"UC-02","flowRef":"main","requirementCodes":["FR-09"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-09","Observe the result returned by the system"],"expected":"The system shall validate the input data of \"Add a new product with name, SKU, category, price and stock\" and show a clear error on each invalid field."}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-026', 25, '{"code":"TC-026","title":"FR-11 – The system shall ensure that: On successful save, show a confirmation and ref…","type":"Positive","priority":"Medium","useCaseCode":"UC-03","flowRef":"main","requirementCodes":["FR-11"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-11","Observe the result returned by the system"],"expected":"The system shall ensure that: On successful save, show a confirmation and refresh the list."}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-027', 26, '{"code":"TC-027","title":"FR-12 – The system shall ensure that: Stock cannot be negative.","type":"Positive","priority":"Medium","useCaseCode":"UC-03","flowRef":"main","requirementCodes":["FR-12"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-12","Observe the result returned by the system"],"expected":"The system shall ensure that: Stock cannot be negative."}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-028', 27, '{"code":"TC-028","title":"FR-13 – The system shall validate the input data of \"Edit the price and stock of a pr…","type":"Positive","priority":"Medium","useCaseCode":"UC-03","flowRef":"main","requirementCodes":["FR-13"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-13","Observe the result returned by the system"],"expected":"The system shall validate the input data of \"Edit the price and stock of a product\" and show a clear error on each invalid field."}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-029', 28, '{"code":"TC-029","title":"FR-15 – The system shall ensure that: Filters can be combined with the search box.","type":"Positive","priority":"Medium","useCaseCode":"UC-04","flowRef":"main","requirementCodes":["FR-15"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-15","Observe the result returned by the system"],"expected":"The system shall ensure that: Filters can be combined with the search box."}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-030', 29, '{"code":"TC-030","title":"FR-16 – The system shall ensure that: There is an ''All categories'' option.","type":"Positive","priority":"Medium","useCaseCode":"UC-04","flowRef":"main","requirementCodes":["FR-16"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-16","Observe the result returned by the system"],"expected":"The system shall ensure that: There is an ''All categories'' option."}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-031', 30, '{"code":"TC-031","title":"FR-18 – The system shall ensure that: Ask for confirmation before discontinuing.","type":"Positive","priority":"Medium","useCaseCode":"UC-05","flowRef":"main","requirementCodes":["FR-18"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-18","Observe the result returned by the system"],"expected":"The system shall ensure that: Ask for confirmation before discontinuing."}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-032', 31, '{"code":"TC-032","title":"FR-19 – The system shall ensure that: Discontinued products are not shown on the webs…","type":"Positive","priority":"Medium","useCaseCode":"UC-05","flowRef":"main","requirementCodes":["FR-19"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-19","Observe the result returned by the system"],"expected":"The system shall ensure that: Discontinued products are not shown on the website."}');
INSERT INTO "test_cases" ("module_id", "code", "ord", "data") VALUES ('demo-mod-products', 'TC-033', 32, '{"code":"TC-033","title":"FR-20 – The system shall validate the input data of \"Discontinue a product\" and show …","type":"Positive","priority":"Medium","useCaseCode":"UC-05","flowRef":"main","requirementCodes":["FR-20"],"preconditions":"Administrator is signed in and has permission to use the function","testData":"-","steps":["Perform the operation described by requirement FR-20","Observe the result returned by the system"],"expected":"The system shall validate the input data of \"Discontinue a product\" and show a clear error on each invalid field."}');

-- Bảng uc_diagrams
CREATE TABLE uc_diagrams (
  module_id TEXT PRIMARY KEY REFERENCES modules(id) ON DELETE CASCADE, code TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','stale')),
  approved_at TEXT, updated_at TEXT NOT NULL
);

-- Bảng use_cases
CREATE TABLE use_cases (
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE, code TEXT NOT NULL, ord INTEGER NOT NULL,
  data TEXT NOT NULL, PRIMARY KEY (module_id, code)
);

-- Bảng user_stories
CREATE TABLE user_stories (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  module_id TEXT REFERENCES modules(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  as_a TEXT NOT NULL DEFAULT '', i_want TEXT NOT NULL DEFAULT '', so_that TEXT NOT NULL DEFAULT '',
  acceptance_criteria TEXT NOT NULL DEFAULT '[]',
  priority TEXT NOT NULL DEFAULT 'Medium' CHECK(priority IN ('High','Medium','Low')),
  ord INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, code)
);
INSERT INTO "user_stories" ("id", "project_id", "module_id", "code", "as_a", "i_want", "so_that", "acceptance_criteria", "priority", "ord", "rev", "created_at", "updated_by", "updated_at") VALUES ('597cfed4-8471-4c7c-b998-1b866661aeb7', 'demo-shop', 'demo-mod-products', 'US-01', 'administrator', 'search products by name or SKU', 'I can check stock before restocking', '["Search matches part of the name, case-insensitive","When there are no results, show the message ''No products found''","Results are paginated at 20 rows per page"]', 'High', 1, 1, '2026-10-21T02:15:54.007Z', 'demo-mem-anh', '2026-10-21T02:15:54.007Z');
INSERT INTO "user_stories" ("id", "project_id", "module_id", "code", "as_a", "i_want", "so_that", "acceptance_criteria", "priority", "ord", "rev", "created_at", "updated_by", "updated_at") VALUES ('5c66fc31-c6e8-4261-a13b-3a38c12d5776', 'demo-shop', 'demo-mod-products', 'US-02', 'administrator', 'add a new product with name, SKU, category, price and stock', 'the product can go on sale on the website', '["Product name is required, up to 100 characters","SKU must be unique","Price must be greater than 0"]', 'High', 2, 1, '2026-10-21T02:15:54.050Z', 'demo-mem-anh', '2026-10-21T02:15:54.050Z');
INSERT INTO "user_stories" ("id", "project_id", "module_id", "code", "as_a", "i_want", "so_that", "acceptance_criteria", "priority", "ord", "rev", "created_at", "updated_by", "updated_at") VALUES ('4213a471-1827-47c4-9224-06b6528d1993', 'demo-shop', 'demo-mod-products', 'US-03', 'administrator', 'edit the price and stock of a product', 'the information on the website is always correct', '["On successful save, show a confirmation and refresh the list","Stock cannot be negative"]', 'Medium', 3, 1, '2026-10-21T02:15:54.067Z', 'demo-mem-anh', '2026-10-21T02:15:54.067Z');
INSERT INTO "user_stories" ("id", "project_id", "module_id", "code", "as_a", "i_want", "so_that", "acceptance_criteria", "priority", "ord", "rev", "created_at", "updated_by", "updated_at") VALUES ('7932f8bb-3b05-4b71-8ca2-bc67ac323f24', 'demo-shop', 'demo-mod-products', 'US-04', 'administrator', 'filter products by category and status', 'I can review prices for each product group', '["Filters can be combined with the search box","There is an ''All categories'' option"]', 'Medium', 4, 1, '2026-10-21T02:15:54.079Z', 'demo-mem-anh', '2026-10-21T02:15:54.079Z');
INSERT INTO "user_stories" ("id", "project_id", "module_id", "code", "as_a", "i_want", "so_that", "acceptance_criteria", "priority", "ord", "rev", "created_at", "updated_by", "updated_at") VALUES ('aab4549b-07dc-43b5-8ed3-fec35a67528d', 'demo-shop', 'demo-mod-products', 'US-05', 'administrator', 'discontinue a product', 'customers cannot order discontinued items', '["Ask for confirmation before discontinuing","Discontinued products are not shown on the website"]', 'Low', 5, 1, '2026-10-21T02:15:54.094Z', 'demo-mem-anh', '2026-10-21T02:15:54.094Z');
INSERT INTO "user_stories" ("id", "project_id", "module_id", "code", "as_a", "i_want", "so_that", "acceptance_criteria", "priority", "ord", "rev", "created_at", "updated_by", "updated_at") VALUES ('bad2b098-05d1-4d9f-a45f-c4919d09e005', 'demo-shop', 'demo-mod-orders', 'US-06', 'sales clerk', 'view the list of orders by status', 'I can process new orders the same day', '["Filter defaults to ''New'' orders","Show order number, customer, total amount and order date"]', 'High', 6, 1, '2026-10-21T02:15:54.106Z', 'demo-mem-anh', '2026-10-21T02:15:54.106Z');
INSERT INTO "user_stories" ("id", "project_id", "module_id", "code", "as_a", "i_want", "so_that", "acceptance_criteria", "priority", "ord", "rev", "created_at", "updated_by", "updated_at") VALUES ('203936b5-8a75-499d-80e7-48b17b0bcc8a', 'demo-shop', 'demo-mod-orders', 'US-07', 'sales clerk', 'create an in-store order and print the invoice', 'the customer receives the invoice at checkout', '["Only products in stock can be selected","The total is calculated automatically from the quantity"]', 'High', 7, 1, '2026-10-21T02:15:54.119Z', 'demo-mem-anh', '2026-10-21T02:15:54.119Z');
INSERT INTO "user_stories" ("id", "project_id", "module_id", "code", "as_a", "i_want", "so_that", "acceptance_criteria", "priority", "ord", "rev", "created_at", "updated_by", "updated_at") VALUES ('9dc973c4-7c5f-4b6d-9c89-d9fd9ebea2f1', 'demo-shop', 'demo-mod-orders', 'US-08', 'sales clerk', 'cancel an order that has not been delivered', 'stock is returned when the customer changes their mind', '["A cancellation reason is required","Delivered orders cannot be cancelled"]', 'Medium', 8, 1, '2026-10-21T02:15:54.132Z', 'demo-mem-anh', '2026-10-21T02:15:54.132Z');
INSERT INTO "user_stories" ("id", "project_id", "module_id", "code", "as_a", "i_want", "so_that", "acceptance_criteria", "priority", "ord", "rev", "created_at", "updated_by", "updated_at") VALUES ('5426909e-f90e-4d37-8a98-d0cb92ccb243', 'demo-shop', 'demo-mod-orders', 'US-09', 'accountant', 'export the monthly order list to Excel', 'I can reconcile revenue at month end', '["The file has order number, date, sales channel and total amount columns"]', 'Low', 9, 1, '2026-10-21T02:15:54.151Z', 'demo-mem-anh', '2026-10-21T02:15:54.151Z');

-- Chỉ mục
CREATE INDEX idx_ann_screen ON annotations(screen_id);
CREATE INDEX idx_files_module ON files(module_id);
CREATE INDEX idx_files_project ON files(project_id);
CREATE INDEX idx_git_pushes_project ON git_pushes(project_id, created_at);
CREATE INDEX idx_modules_project ON modules(project_id);
CREATE INDEX idx_runs_module ON prompt_runs(module_id);
CREATE INDEX idx_screens_module ON screens(module_id);
CREATE INDEX idx_stories_module ON user_stories(module_id);
CREATE INDEX idx_stories_project ON user_stories(project_id, ord);
CREATE INDEX idx_sugg_screen ON suggestion_events(screen_id);
CREATE INDEX idx_task_events_task ON task_events(task_id);
CREATE INDEX idx_tasks_artifact ON tasks(artifact_type, artifact_id);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_versions_screen ON screen_versions(screen_id);

COMMIT;
PRAGMA foreign_keys = ON;
