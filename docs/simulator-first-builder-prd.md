# PRD — Simulator-First Rork-Like AI Mobile App Builder

> **Working name:** `AppFoundry Simulator`
>
> **Core mandate:** Do **not** waste effort cloning the public marketing site. The product to clone is the **actual app builder/simulator workspace**: prompt → generated mobile app → live device simulator → build/error loop → iterative chat edits → export/sync.
>
> **Primary implementation target:** Expo / React Native generated apps rendered inside a browser-hosted mobile simulator, with an autonomous Codex loop that can keep iterating while the user is away.
>
> **Legal boundary:** Build functional parity. Do not copy Rork’s brand, logo, screenshots, exact UI copy, proprietary assets, or trade dress. We are cloning the workflow and system behavior, not their identity.

---

## 0. Research Basis

Public Rork signals used:

| Finding | Source |
|---|---|
| Rork homepage positions the product as “Create mobile apps by chatting with AI” and includes prompt input, file upload, target selector, and model selector | `https://rork.com/` |
| Docs say Rork generates apps in the browser, handles design/builds, and prepares apps for the App Store | `https://docs.rork.com/` |
| First-app docs describe: prompt on homepage → sent to Rork editor → agent works → fully functional app in minutes → test in website simulator or scan QR for Expo Go → iterate via more messages → clone project | `https://docs.rork.com/introduction/build-your-first-app` |
| Prompting docs emphasize UX feel, polish, motion, mood, target user, clear primary goal, and constrained scope | `https://docs.rork.com/introduction/introduction/prompting-strategy` |
| Technical FAQ says Rork apps are React Native + Expo for cross-platform native apps; Rork Max is Swift/iOS-native | `https://docs.rork.com/faq/technical` |
| Rork Expo testing docs show Expo Go QR/device testing as part of the workflow | `https://docs.rork.com/rork-expo` |
| Rork Max docs describe a Swift path using companion app, Apple sign-in, Mac/iPhone connection, and one-click device run | `https://docs.rork.com/rork-max-swift` |
| GitHub docs describe GitHub sync as the bridge from Rork editor to traditional dev tools, Cursor, Xcode, and code-level customization | `https://docs.rork.com/tutorials/how-to-connect-github` |
| API docs describe env vars, API keys, Supabase edge functions, API docs attachments, and repeated trial/error prompting | `https://docs.rork.com/features-apis/apis/how-to-connect-an-api-to-your-project` |
| Swift vs React Native docs position Expo/RN as speed/reach and Swift as iOS-first polish/deeper platform access | `https://docs.rork.com/swift-vs-react-native/whats-the-difference` |

---

## 1. Product Objective

### 1.1 What we are actually building

A browser-based AI mobile app simulator/workspace where a user can:

```text
describe app
  → watch agent generate Expo/React Native app
  → see it running inside an iPhone-style simulator
  → inspect files/logs/build output
  → ask for changes in chat
  → watch build/repair loop run again
  → test on phone via QR
  → clone/export/sync project
```

### 1.2 What we are explicitly not focusing on

```text
Not a marketing homepage clone.
Not a brand clone.
Not a static website.
Not a generic chatbot.
Not a toy code generator.
Not a single-shot “generate files once” system.
```

### 1.3 The product center of gravity

The simulator/editor is the product.

The magic must happen here:

```text
┌────────────────────────────────────────────────────────────────────┐
│ Project top bar: app name / target / build state / export / clone   │
├───────────────┬────────────────────────┬───────────────────────────┤
│ Chat + agent  │ Live phone simulator   │ Files / Code / Logs        │
│ run timeline  │ running generated app  │ Build / Errors / Diff      │
├───────────────┴────────────────────────┴───────────────────────────┤
│ Bottom command/status rail: queued → coding → building → fixing      │
└────────────────────────────────────────────────────────────────────┘
```

---

## 2. Simulator-First MVP

### 2.1 MVP acceptance in one sentence

A user can prompt for a mobile app, wait while the agent generates it, then interact with the generated app inside a browser-hosted iPhone simulator and iterate through chat.

### 2.2 MVP feature set

| Feature | MVP Required | Notes |
|---|---:|---|
| Prompt composer inside builder | Yes | Not just homepage |
| Project workspace | Yes | Persistent per app |
| Agent run timeline | Yes | User must see the loop working |
| Expo/React Native scaffold generator | Yes | Start with template + LLM mutations |
| Browser mobile simulator | Yes | Device frame + iframe/web preview |
| Build logs panel | Yes | Must show real logs |
| File tree | Yes | Read generated files |
| Code viewer | Yes | Monaco read-only first, editable later |
| Chat iteration | Yes | Follow-up prompt creates patch run |
| Build/error repair loop | Yes | Minimum 5 attempts |
| Preview reload | Yes | After successful build |
| QR code for Expo Go | Yes | Required for real device testing path |
| Project clone | Yes | Critical for branching experiments |
| GitHub export placeholder | Yes | Full sync can be phase 2 |
| Run memory/logs | Yes | Needed for autonomous loop |
| Autonomous Codex loop spec | Yes | Dedicated final section |

### 2.3 Explicitly deferred

| Feature | Reason |
|---|---|
| Swift/Rork Max equivalent | Requires Mac runner/Xcode/device signing complexity |
| Real App Store submission | Later |
| Real Play Store submission | Later |
| Full marketplace/templates | Later |
| Real multi-user collaboration | Later |
| Native iOS simulator streaming | Later |
| RevenueCat auto-provisioning | Later |
| Supabase full backend wizard | Later, but env/API stubs required |

---

## 3. Builder Workspace UX

### 3.1 Workspace layout

The builder must be a dense product workspace, not a landing page.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Top bar                                                                      │
│ AppFoundry | Project name | Expo/RN | Build: Ready | Clone | Export | Share   │
├──────────────────────┬──────────────────────────────┬──────────────────────┤
│ LEFT: Agent Chat     │ CENTER: Device Simulator      │ RIGHT: Inspector      │
│                      │                              │                      │
│ - prompt box         │ ┌──────────────────────────┐ │ Tabs:                │
│ - message history    │ │ iPhone / Android frame    │ │ - Files              │
│ - run timeline       │ │ live generated app iframe │ │ - Code               │
│ - approvals          │ │ gesture/tap simulation    │ │ - Build logs         │
│ - next actions       │ └──────────────────────────┘ │ - Errors             │
│                      │                              │ - Diff               │
│                      │ Toolbar:                    │ - Integrations       │
│                      │ reload / rotate / QR / shot │                      │
└──────────────────────┴──────────────────────────────┴──────────────────────┘
```

### 3.2 Left panel — Chat + agent timeline

Must include:

```text
Chat history
  - user prompt
  - assistant plan
  - tool/run messages
  - final summary

Prompt composer
  - text input
  - attachment upload
  - target selector
  - mode selector
  - submit button

Agent timeline
  - Understanding request
  - Creating spec
  - Planning files
  - Generating screens
  - Installing dependencies
  - Running build
  - Fixing errors
  - Starting preview
  - Ready

Approval cards
  - store secret?
  - export to GitHub?
  - delete files?
  - overwrite project?
```

### 3.3 Center panel — live simulator

The simulator must feel like the core product.

Required:

```text
Device frame
  - iPhone 15-style frame first
  - Android frame later
  - no need to clone exact Rork frame

Live app viewport
  - iframe to Expo web preview or hosted preview URL
  - interactive tapping/clicking
  - keyboard simulation
  - route reload
  - state reset

Simulator toolbar
  - reload preview
  - rotate portrait/landscape
  - switch device size
  - open full-screen
  - capture screenshot
  - show QR code
  - copy preview link
  - reset app state
  - inspect console/errors

Runtime overlays
  - loading preview
  - build failed
  - app crashed
  - waiting for server
  - reconnecting
  - ready
```

### 3.4 Right panel — files/code/logs inspector

Tabs:

```text
Files
  - generated project tree
  - changed file badges
  - search files
  - open file

Code
  - Monaco viewer
  - syntax highlighting
  - diff mode
  - copy file
  - later: edit file manually

Build logs
  - command logs
  - stdout/stderr
  - install logs
  - Expo logs
  - TypeScript errors

Errors
  - classified error list
  - file/line
  - repair attempt count
  - suggested fix
  - resolved/unresolved

Diff
  - files changed in current run
  - additions/deletions
  - accept/revert later

Integrations
  - env vars
  - API keys
  - Supabase
  - GitHub
```

---

## 4. Core User Journeys

### 4.1 First app generation

```text
1. User opens builder.
2. User enters: “Build a premium habit tracker for busy founders.”
3. User selects: iPhone / polished / Expo.
4. System creates project.
5. Agent converts prompt to AppSpec.
6. Agent generates file plan.
7. Worker scaffolds Expo project.
8. Agent writes screens/components.
9. Worker runs install/typecheck/build.
10. Repair loop fixes errors.
11. Preview server starts.
12. Simulator displays running app.
13. User clicks through generated app.
14. System shows summary: files changed, build status, next actions.
```

### 4.2 Iteration flow

```text
1. User says: “Make onboarding more premium and add subtle motion.”
2. Agent classifies as UI polish edit.
3. Agent inspects existing files.
4. Agent produces patch plan.
5. Agent edits only affected screens/components.
6. Worker runs typecheck/build.
7. Repair loop patches errors.
8. Simulator reloads.
9. Diff tab shows changed files.
10. Assistant summarizes visible changes.
```

### 4.3 Crash/failure flow

```text
1. Preview crashes or build fails.
2. Simulator shows failure overlay.
3. Logs tab opens automatically.
4. Error classifier identifies category:
   - syntax
   - missing dependency
   - type error
   - routing error
   - asset error
   - runtime crash
5. Repair loop attempts smallest fix.
6. If fixed, preview reloads.
7. If unresolved after max attempts, agent writes diagnosis and asks for approval to simplify/retry.
```

### 4.4 Clone flow

```text
1. User clicks Clone.
2. System snapshots:
   - files
   - AppSpec
   - run history
   - prompt history
   - integration config without secrets
3. New project opens as branch experiment.
4. User can try a new direction safely.
```

### 4.5 QR real-device test flow

```text
1. Build passes.
2. Preview toolbar shows “Test on phone”.
3. User clicks QR.
4. System exposes Expo Go QR or dev server URL.
5. User scans with phone.
6. System displays connection status if possible.
```

---

## 5. Simulator Technical Architecture

### 5.1 MVP technical choice

Use Expo/React Native + Expo web preview.

Do not attempt native iOS simulator streaming first.

```text
Generated Expo app
  → sandbox worker
  → install deps
  → run Expo web/dev server
  → preview service proxies URL
  → browser iframe inside phone frame
```

### 5.2 Runtime model

```text
Platform app
  - Next.js UI
  - Auth
  - project dashboard/editor
  - run timeline
  - logs
  - file inspector

Generated app workspace
  - isolated per project/run
  - contains Expo project
  - can be rebuilt
  - can run web preview
  - can generate QR

Worker
  - creates project scaffold
  - applies generated patches
  - runs commands
  - captures logs
  - streams state

Preview service
  - starts/stops preview servers
  - maps project/run to preview URL
  - proxies iframe traffic
  - restarts previews
```

### 5.3 Workspace isolation

Every generated app must live outside the platform source.

```text
generated-workspaces/
  <project_id>/
    current/
      package.json
      app/
      components/
      assets/
      ...
    runs/
      <run_id>/
        before/
        after/
        logs/
        patches/
```

Rules:

```text
- generated app code must never import platform app code
- platform secrets must never be copied into generated workspace
- generated commands run in sandbox/container
- max command timeouts
- resource limits
- no arbitrary destructive commands
```

### 5.4 Preview server options

#### Option A — Long-running dev server

```text
npx expo start --web --port <assigned_port>
```

Pros:

- hot reload potential
- closer dev feel
- QR path easier

Cons:

- long-running process management
- port conflicts
- memory cost

#### Option B — Static web export

```text
npx expo export --platform web
serve dist/
```

Pros:

- more stable
- easier to host/snapshot
- safer for preview

Cons:

- slower iteration
- less live/dev feel
- QR path separate

#### MVP recommendation

Use hybrid:

```text
Interactive builder preview:
  expo start --web in isolated process

Stable run snapshot:
  expo export --platform web after success
```

### 5.5 Simulator state machine

```text
idle
  → queued
  → generating_spec
  → planning_files
  → writing_files
  → installing_dependencies
  → typechecking
  → building
  → repairing
  → starting_preview
  → ready
  → failed
  → needs_approval
```

Required UI mapping:

| State | Simulator UI |
|---|---|
| idle | empty phone frame |
| queued | queued overlay |
| generating_spec | “Designing your app” |
| writing_files | animated file-writing status |
| building | “Compiling preview” |
| repairing | “Fixing build issue, attempt X/5” |
| starting_preview | “Starting simulator” |
| ready | live app |
| failed | failure overlay + logs CTA |
| needs_approval | approval card |

---

## 6. Generated App Requirements

### 6.1 Expo app baseline

Generated apps should use:

```text
Expo
React Native
TypeScript
Expo Router
safe-area-context
gesture-handler where needed
reanimated only if already configured safely
lucide-react-native or minimal icon system
local placeholder data
StyleSheet or NativeWind depending repo choice
```

MVP should avoid fragile dependencies.

### 6.2 Default app quality bar

Every generated app should include:

```text
3–5 screens max
coherent navigation
polished layout
realistic sample data
empty states
loading states
error states
clear primary action
mobile-first spacing
safe area support
basic accessibility labels
responsive small-screen handling
```

### 6.3 Default file structure

```text
app/
  _layout.tsx
  index.tsx
  onboarding.tsx
  dashboard.tsx
  settings.tsx

components/
  Button.tsx
  Card.tsx
  Screen.tsx
  EmptyState.tsx
  StatCard.tsx

lib/
  data.ts
  theme.ts
  types.ts

assets/
  placeholder.png

package.json
app.json
tsconfig.json
```

### 6.4 AppSpec schema

```ts
type AppSpec = {
  appName: string;
  appOneLiner: string;
  targetPlatform: "ios" | "android" | "cross_platform";
  buildMode: "fast" | "polished" | "production";
  targetUser: string;
  primaryUseCase: string;
  visualMood: string;
  screens: {
    name: string;
    route: string;
    purpose: string;
    coreComponents: string[];
    primaryAction?: string;
    emptyState?: string;
    loadingState?: string;
    errorState?: string;
  }[];
  dataModels: {
    name: string;
    fields: { name: string; type: string; required: boolean }[];
  }[];
  integrations: {
    provider: string;
    reason: string;
    requiredSecrets: string[];
    status: "stub" | "configured" | "missing_secret";
  }[];
  acceptanceCriteria: string[];
  nonGoals: string[];
};
```

---

## 7. Agent Loop System

### 7.1 The main loop

```text
User Prompt
  → classify request
  → generate/update AppSpec
  → plan file changes
  → apply patches
  → run checks
  → classify failures
  → repair
  → run preview
  → verify simulator loads
  → summarize
  → wait for next prompt
```

### 7.2 Loop types inside simulator

| Loop | Purpose |
|---|---|
| Prompt-to-Spec Loop | Convert vague idea into structured app plan |
| Spec-to-FilePlan Loop | Decide exact files to create/change |
| Generation Loop | Write generated app code |
| Build Loop | Install/typecheck/build generated app |
| Repair Loop | Read errors and patch smallest responsible files |
| Preview Loop | Start/reload simulator |
| Visual QA Loop | Screenshot/app inspect, then improve UI |
| Diff Review Loop | Check scope of changes |
| Clone Loop | Branch project safely |
| Export Loop | Push generated app to GitHub |
| Autonomous Improvement Loop | Keep iterating when user is away |

### 7.3 Agent run contract

Every agent run must produce:

```text
run_id
project_id
trigger
input prompt
classification
plan
files intended
files changed
commands run
errors found
repair attempts
preview URL
final status
summary
next recommended action
```

### 7.4 No invisible magic

The user must always be able to inspect:

```text
what the agent is doing
why it is doing it
what file changed
what command failed
what it tried to fix
what it will do next
```

---

## 8. Build / Repair Loop

### 8.1 Required build commands

For each generated workspace:

```bash
npm install
npm run typecheck --if-present
npm run lint --if-present
npx expo export --platform web
npx expo start --web --port <port>
```

If package manager is pnpm/yarn, detect and use repo standard.

### 8.2 Error classifier

Classify errors into:

```text
missing_dependency
invalid_import
typescript_error
jsx_syntax
expo_config
router_error
asset_missing
runtime_error
style_error
unknown
```

### 8.3 Repair loop pseudocode

```ts
for attempt in 1..MAX_REPAIR_ATTEMPTS:
  result = runBuild()
  if result.success:
    return success

  error = classify(result.stderr)
  patchPlan = createSmallestPatch(error, files)
  applyPatch(patchPlan)
  logAttempt(error, patchPlan)

return failedDiagnosis()
```

### 8.4 Max attempts

```text
default max attempts: 5
hard max: 8
after hard max: stop, summarize, ask human
```

### 8.5 Repair rules

```text
Do:
- patch smallest relevant file
- preserve app intent
- prefer removing fragile dependency over adding complexity
- write missing component if import expects it
- fix routing before styling
- fix build before UI polish

Do not:
- rewrite entire app unless authorized
- add random dependencies
- delete screens to hide errors
- suppress TypeScript broadly
- ignore failing commands
- mark preview ready without actual load check
```

---

## 9. Visual Simulator QA Loop

### 9.1 Why this matters

Rork-like perceived value comes from the user seeing a real app inside a phone frame. If the generated app technically builds but looks like boilerplate, the product fails.

### 9.2 Visual QA loop

```text
After preview loads:
  1. capture screenshot of simulator
  2. inspect layout
  3. score visual quality
  4. identify issues:
     - cramped spacing
     - weak hierarchy
     - ugly colors
     - broken safe area
     - unbalanced cards
     - poor empty state
     - inconsistent buttons
  5. patch UI only
  6. rebuild
  7. capture second screenshot
  8. compare improvement
```

### 9.3 Visual quality rubric

| Dimension | Bad | Good |
|---|---|---|
| Hierarchy | everything same weight | clear primary/secondary |
| Spacing | cramped/random | consistent scale |
| Typography | default/no rhythm | clear sizes/weights |
| Color | arbitrary | coherent palette |
| Mobile feel | web page in phone | native-feeling screens |
| Empty states | blank | helpful and polished |
| Motion | static/dead | subtle interactions |
| Navigation | confusing | obvious flow |

### 9.4 Screenshot artifact

Every successful generation should store:

```text
before_visual_qa.png
after_visual_qa.png
visual_score.json
visual_qa_notes.md
```

---

## 10. File / Code Inspector

### 10.1 MVP

Read-only code viewer.

Required:

```text
file tree
active file
syntax highlighting
search
copy code
changed-file badges
diff tab
```

### 10.2 Phase 2

Editable code.

Required:

```text
manual edit
save
run build
manual edit diff
revert file
AI explain file
AI refactor file
```

### 10.3 Diff review

After every run:

```text
show changed files
show added/deleted lines
mark generated vs repaired
show why file changed
allow revert run
```

---

## 11. Data Model

### 11.1 projects

```sql
projects (
  id uuid primary key,
  owner_id uuid not null,
  name text not null,
  target_platform text not null,
  build_mode text not null,
  status text not null,
  current_run_id uuid,
  preview_url text,
  expo_qr_url text,
  github_repo_url text,
  parent_project_id uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
```

### 11.2 project_messages

```sql
project_messages (
  id uuid primary key,
  project_id uuid not null,
  role text not null,
  content text not null,
  attachments jsonb default '[]',
  run_id uuid,
  created_at timestamptz not null
);
```

### 11.3 app_specs

```sql
app_specs (
  id uuid primary key,
  project_id uuid not null,
  run_id uuid not null,
  version integer not null,
  raw_prompt text not null,
  spec jsonb not null,
  created_at timestamptz not null
);
```

### 11.4 project_files

```sql
project_files (
  id uuid primary key,
  project_id uuid not null,
  path text not null,
  content text not null,
  language text,
  hash text not null,
  last_run_id uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique(project_id, path)
);
```

### 11.5 agent_runs

```sql
agent_runs (
  id uuid primary key,
  project_id uuid not null,
  trigger text not null,
  type text not null,
  status text not null,
  current_phase text,
  attempt_count integer default 0,
  max_attempts integer default 5,
  input jsonb not null,
  output jsonb,
  error text,
  preview_url text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null
);
```

### 11.6 agent_run_steps

```sql
agent_run_steps (
  id uuid primary key,
  run_id uuid not null,
  phase text not null,
  status text not null,
  message text,
  input jsonb,
  output jsonb,
  logs text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null
);
```

### 11.7 preview_sessions

```sql
preview_sessions (
  id uuid primary key,
  project_id uuid not null,
  run_id uuid not null,
  port integer,
  url text,
  status text not null,
  process_id text,
  started_at timestamptz,
  stopped_at timestamptz,
  last_healthcheck_at timestamptz
);
```

### 11.8 visual_qa_artifacts

```sql
visual_qa_artifacts (
  id uuid primary key,
  project_id uuid not null,
  run_id uuid not null,
  before_screenshot_url text,
  after_screenshot_url text,
  score jsonb,
  notes text,
  created_at timestamptz not null
);
```

---

## 12. API Requirements

### 12.1 Project APIs

```text
POST   /api/projects
GET    /api/projects
GET    /api/projects/:id
POST   /api/projects/:id/clone
DELETE /api/projects/:id
```

### 12.2 Message/run APIs

```text
POST /api/projects/:id/messages
GET  /api/projects/:id/messages
POST /api/projects/:id/runs
GET  /api/projects/:id/runs
GET  /api/runs/:runId
GET  /api/runs/:runId/steps
```

### 12.3 File APIs

```text
GET  /api/projects/:id/files
GET  /api/projects/:id/files?path=
POST /api/projects/:id/files
GET  /api/projects/:id/diff?runId=
POST /api/projects/:id/revert-run
```

### 12.4 Preview APIs

```text
POST /api/projects/:id/preview/start
POST /api/projects/:id/preview/restart
POST /api/projects/:id/preview/stop
GET  /api/projects/:id/preview/status
GET  /api/projects/:id/preview/qr
POST /api/projects/:id/preview/screenshot
```

### 12.5 Streaming

Use Server-Sent Events or WebSocket.

```text
GET /api/runs/:runId/events
```

Events:

```ts
type RunEvent =
  | { type: "phase_started"; phase: string }
  | { type: "phase_completed"; phase: string }
  | { type: "log"; message: string }
  | { type: "file_changed"; path: string }
  | { type: "error_detected"; category: string; message: string }
  | { type: "repair_attempt"; attempt: number }
  | { type: "preview_ready"; url: string }
  | { type: "run_failed"; error: string }
  | { type: "run_success"; summary: string };
```

---

## 13. Worker Architecture

### 13.1 Worker responsibilities

```text
generation-worker
  - create AppSpec
  - create file plan
  - generate files

build-worker
  - install deps
  - typecheck
  - build/export
  - classify errors

repair-worker
  - create patch plan
  - apply patches
  - rerun build

preview-worker
  - start Expo web
  - proxy URL
  - healthcheck preview
  - generate QR

visual-worker
  - screenshot simulator
  - inspect visual quality
  - apply visual polish patches
```

### 13.2 Queue jobs

```text
GenerateAppJob
PatchAppJob
BuildAppJob
RepairBuildJob
StartPreviewJob
CaptureScreenshotJob
VisualQAFixJob
ExportGitHubJob
AutonomousIterationJob
```

### 13.3 Job payload example

```ts
type GenerateAppJob = {
  projectId: string;
  runId: string;
  prompt: string;
  targetPlatform: "ios" | "android" | "cross_platform";
  buildMode: "fast" | "polished" | "production";
  attachments: { name: string; url: string; mimeType: string }[];
};
```

---

## 14. Prompts

### 14.1 AppSpec prompt

```md
You are turning a user’s mobile app idea into a concise AppSpec for an Expo/React Native app.

Rules:
- Keep scope small enough to compile.
- Prioritize simulator-ready output.
- 3–5 screens max.
- Include target user, mood, primary goal, screens, data models, acceptance criteria.
- If prompt is vague, make reasonable assumptions instead of blocking.
- Avoid unnecessary integrations unless the user explicitly asks.

Return valid JSON matching AppSpec.
```

### 14.2 File plan prompt

```md
You are planning file changes for an Expo/React Native app.

Input:
- AppSpec
- existing file tree
- current build status

Return:
- files to create
- files to edit
- files to leave unchanged
- dependency changes
- risk notes

Rules:
- Prefer minimal file set.
- Do not add dependencies unless necessary.
- Do not touch platform source files.
- Generated app must boot in Expo web preview.
```

### 14.3 Code generation prompt

```md
You are generating Expo/React Native TypeScript code.

Rules:
- Output complete files.
- No pseudocode.
- No omitted imports.
- Keep app simple and polished.
- Use local sample data if backend is not configured.
- Include loading/empty/error states where relevant.
- Use safe area.
- Use Expo Router.
- Avoid fragile packages.
- Generated app must compile and render inside browser simulator.

Return file patches only.
```

### 14.4 Repair prompt

```md
You are repairing a generated Expo/React Native project.

Input:
- build logs
- error classification
- relevant files
- package.json

Rules:
- Patch smallest responsible cause.
- Do not rewrite entire app.
- Do not hide errors by deleting features unless feature is non-essential.
- Do not add dependencies unless simpler than patching code.
- After patch, explain why this should fix the build.

Return:
- diagnosis
- files to change
- exact patch
- expected verification command
```

### 14.5 Visual QA prompt

```md
You are improving the visual quality of a generated mobile app based on simulator screenshots.

Rules:
- Do not add new product features.
- Improve hierarchy, spacing, typography, colors, cards, buttons, empty states.
- Keep code simple.
- Preserve current navigation and data models.
- Make the app feel premium and mobile-native.

Return:
- visual score before
- issues found
- file-level patch plan
- exact patches
- expected visual improvement
```

---

## 15. Implementation Milestones

### Milestone 1 — Simulator shell

Build:

```text
- project editor route
- three-panel layout
- fake phone frame
- placeholder app inside frame
- chat panel
- run timeline
- files/code/logs tabs
- fake run events
```

Acceptance:

```text
User can open project editor and see a convincing simulator workspace.
```

### Milestone 2 — Real generated workspace

Build:

```text
- create generated workspace folder
- copy base Expo template
- persist generated files
- show files in inspector
- run basic commands
```

Acceptance:

```text
System can create project files and show them in UI.
```

### Milestone 3 — Live preview

Build:

```text
- start Expo web server per project
- proxy preview URL
- render in simulator iframe
- restart/reload preview
- preview healthcheck
```

Acceptance:

```text
Generated app runs inside browser simulator.
```

### Milestone 4 — LLM AppSpec + generation

Build:

```text
- AppSpec schema
- spec generation
- file plan
- generated screens/components
- changed files persisted
```

Acceptance:

```text
User prompt creates a real generated app.
```

### Milestone 5 — Build/repair loop

Build:

```text
- build logs
- error classifier
- repair attempts
- rerun build
- failure diagnosis
```

Acceptance:

```text
Common generated-code errors self-repair without user intervention.
```

### Milestone 6 — Chat iteration

Build:

```text
- follow-up prompt
- patch existing files
- rebuild
- reload simulator
- show diff
```

Acceptance:

```text
User can iterate the generated app from chat.
```

### Milestone 7 — Visual QA loop

Build:

```text
- simulator screenshot
- visual score
- UI polish patch
- rebuild/reload
- before/after artifact
```

Acceptance:

```text
Generated app becomes visibly better after visual QA.
```

### Milestone 8 — Clone/export

Build:

```text
- project clone
- GitHub export
- ZIP export fallback
```

Acceptance:

```text
User can branch experiments and export code.
```

---

## 16. Simulator Acceptance Criteria

### 16.1 Functional

```text
- generated app appears inside phone frame
- user can tap/click through preview
- reload works
- build failure shows useful overlay
- logs are visible
- files are visible
- chat iteration triggers real patch
- successful patch reloads preview
- clone creates independent project copy
```

### 16.2 Reliability

```text
- preview process healthchecked
- run cannot loop forever
- failed run produces diagnosis
- generated code isolated
- secrets redacted
- port conflicts handled
- stale preview cleaned up
```

### 16.3 Quality

```text
- generated default app looks polished enough for founder demo
- no blank default Expo screen
- no broken navigation
- no obviously web-looking layout inside phone
- no giant unstyled text blocks
- simulator status always clear
```

### 16.4 UX

```text
- user always knows what agent is doing
- build/repair status is visible
- errors are understandable
- preview is the dominant focus
- logs/code are available but secondary
- user can continue prompting without leaving simulator
```

---

## 17. Ruthless Prioritization

### Build first

```text
1. Real simulator frame
2. Real Expo web preview
3. Real file generation
4. Real build logs
5. Real repair loop
6. Real chat iteration
7. Real visual QA loop
```

### Do not waste time on

```text
1. marketing page polish
2. pricing page
3. docs site
4. onboarding survey
5. template marketplace
6. App Store automation
7. Swift native path
8. social proof
```

### If only one thing works

It must be this:

```text
Prompt creates app → app runs in phone simulator → follow-up prompt changes app → simulator reloads.
```

---

## 18. Dedicated Autonomous Codex Loop

> **Purpose:** Let Codex work through the simulator implementation in repeated cycles while the user is away, without requiring constant prompting.

### 18.1 Autonomous loop goal

Codex should run a controlled implementation loop that repeatedly improves the simulator until it hits a stop condition.

```text
Plan
  → implement small slice
  → run checks
  → inspect UI/build
  → fix failures
  → commit checkpoint
  → choose next slice
  → repeat
```

### 18.2 Operating constraints

Codex must obey:

```text
- work only on a feature branch
- do not push to main
- do not delete large directories
- do not touch secrets
- do not edit .env
- do not install major dependencies without reason
- keep each loop iteration small
- save logs after every iteration
- stop after max iterations or hard failure
- prefer working simulator over broad architecture
```

### 18.3 Suggested branch

```bash
git checkout -b feat/simulator-first-builder
```

### 18.4 Loop directory

Codex should create:

```text
.ai/loops/simulator-autobuild/
  LOOP.md
  STATUS.md
  iteration-001.md
  iteration-002.md
  iteration-003.md
  logs/
  screenshots/
  decisions/
```

### 18.5 Loop status file

Create `.ai/loops/simulator-autobuild/STATUS.md`:

```md
# Simulator Autobuild Status

## Current objective

Build the simulator-first AI mobile app builder.

## Current phase

[phase]

## Last completed iteration

[number]

## Working branch

feat/simulator-first-builder

## Passing checks

- [ ] install
- [ ] lint
- [ ] typecheck
- [ ] build
- [ ] preview loads

## Current blockers

- none

## Next action

[next small action]

## Stop condition

Stop when:
- simulator shell exists
- Expo preview runs in phone frame
- generated files appear in inspector
- build logs appear
- mock/real run timeline works
- at least one follow-up prompt updates files
```

### 18.6 Autonomous loop phases

Codex should execute in this order.

```text
Phase 1 — Repo discovery
  - inspect package manager
  - inspect framework
  - inspect routes
  - inspect existing UI system
  - inspect scripts
  - record repo map

Phase 2 — Simulator shell
  - create project editor route
  - create three-panel layout
  - create phone frame
  - create status/timeline UI
  - create inspector tabs

Phase 3 — Mock loop
  - create fake run state
  - stream fake timeline events
  - render placeholder app
  - show fake files/logs

Phase 4 — Workspace filesystem
  - create generated workspace abstraction
  - create base Expo template
  - persist files
  - render file tree from workspace

Phase 5 — Preview process
  - start Expo web or static preview
  - proxy preview URL
  - iframe into phone frame
  - healthcheck preview

Phase 6 — Build logs
  - run command wrapper
  - capture stdout/stderr
  - stream logs into UI
  - classify simple failures

Phase 7 — Repair loop
  - implement max attempt loop
  - classify common errors
  - apply patch
  - rerun checks

Phase 8 — Chat iteration
  - accept follow-up prompt
  - create patch plan
  - apply patch
  - rebuild/reload

Phase 9 — Visual QA
  - screenshot preview
  - score visual issues
  - patch UI
  - capture after screenshot

Phase 10 — Final hardening
  - loading states
  - error states
  - stop conditions
  - docs
  - final summary
```

### 18.7 Iteration template

Each iteration must create:

```text
.ai/loops/simulator-autobuild/iteration-XXX.md
```

Template:

```md
# Iteration XXX

## Goal

[one small goal]

## Files inspected

- ...

## Files changed

- ...

## Commands run

```bash
...
```

## Result

- success / failed / partial

## Errors

[logs or summary]

## Fixes applied

- ...

## Checks

- [ ] lint
- [ ] typecheck
- [ ] build
- [ ] preview

## Screenshot / artifact

[path if available]

## Next iteration

[next small goal]
```

### 18.8 Codex autonomous master prompt

Use this exact prompt:

```md
You are Codex working autonomously on the simulator-first Rork-like builder.

Read:
- this PRD
- AGENTS.md if present
- package.json
- existing app structure

Your mission:
Build the actual simulator/workspace, not a marketing site.

Core outcome:
Prompt creates or updates an Expo/React Native app, and the generated app runs inside a browser phone simulator with logs/files/chat visible.

Work loop:
1. Inspect repo.
2. Create branch `feat/simulator-first-builder` if not already on it.
3. Create `.ai/loops/simulator-autobuild/STATUS.md`.
4. Pick the smallest next milestone from the PRD.
5. Implement it.
6. Run available checks.
7. Fix failures.
8. Write `.ai/loops/simulator-autobuild/iteration-XXX.md`.
9. Update STATUS.md.
10. Commit safe checkpoint if checks pass.
11. Continue to next iteration.

Hard rules:
- Do not work on landing page polish.
- Do not clone Rork branding/copy/assets.
- Do not push to main.
- Do not edit secrets or .env.
- Do not delete large directories.
- Do not perform destructive shell commands.
- Do not get stuck rewriting architecture.
- Prefer visible simulator progress over invisible abstractions.
- Keep diffs scoped.
- Stop after 10 iterations, or earlier if the simulator loop works.

Definition of done:
- Builder workspace exists.
- Phone simulator frame exists.
- Generated app preview appears inside it.
- Chat panel can trigger a run.
- Run timeline updates.
- Files/code/logs panels exist.
- Build output is captured.
- Failed builds produce useful errors.
- At least mocked follow-up edit updates preview or file state.
- STATUS.md explains remaining work.
```

### 18.9 Stop conditions

Codex must stop if:

```text
- 10 iterations completed
- same error repeats 3 times
- build system cannot be identified
- dependency install fails due to auth/private registry
- generated workspace cannot be sandboxed
- action would require secrets
- action would require production deployment
- action would require Apple/Google credentials
- user approval is needed
```

### 18.10 Success condition for “while user is outside”

The loop is successful if the user returns to:

```text
- a working branch
- clear STATUS.md
- multiple iteration logs
- visible simulator UI
- at least partial generated-app preview
- known blockers listed
- no hidden destructive changes
```

---

## 19. Final Codex Command

```md
Implement the simulator-first builder from this PRD.

Ignore marketing-site cloning.

Prioritize:
1. project editor workspace
2. phone simulator frame
3. generated Expo preview
4. run timeline
5. files/code/logs inspector
6. build/error repair loop
7. chat iteration
8. autonomous loop logs

Create the autonomous loop files under:
.ai/loops/simulator-autobuild/

Work on:
feat/simulator-first-builder

Run iterative implementation cycles and document every cycle.

Stop after 10 iterations or when the simulator works end-to-end.
```

---

## 20. Practical Product Thesis

The product is not the website.

The product is:

```text
a live mobile software factory in the browser
  where the simulator is proof that the AI actually built something
  and the loop is what makes it keep improving
```

If the simulator works, everything else can be rebranded later.

If the simulator does not work, the whole product is fake.