# AI Chat — Requirements Document

A local, self-hosted AI chat web application for desktop and mobile. Single Docker container, multi-user, with long-term memory, agents, deep research, and an MCP tool ecosystem.

---

## 1. Goals & Non-Goals

### Goals

- Self-hostable in one Docker container with minimal configuration.
- Transparent by design: every tool call, memory write, and research step is visible to the user.
- Provider-agnostic chat with per-conversation model selection.
- Durable long-term memory built automatically from conversations, stored as OKF bundles.
- Extensible via MCP (stdio + HTTP/SSE).
- Works on mobile and desktop, installable as a PWA.

### Non-Goals

- Cloud/SaaS hosting or multi-tenant isolation beyond per-user data separation.
- Voice agents / real-time audio streaming.
- Training or fine-tuning of models.
- A mobile native app (PWA only).

---

## 2. Tech Stack

| Concern               | Choice                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------- |
| Framework             | SvelteKit (Svelte 5 runes syntax)                                                             |
| Language              | TypeScript (strict)                                                                           |
| UI components (base)  | shadcn-svelte (Radix-based, copy-in components)                                               |
| UI components (AI)    | [sv-prompt-kit](https://sv-prompt-kit.vercel.app) — AI-focused shadcn-svelte registry         |
| Styling               | Tailwind CSS (shadcn-svelte's default theme; minimal token set)                               |
| AI inference          | Vercel AI SDK (`ai`, `@ai-sdk/svelte`, provider packages)                                     |
| Database              | SQLite (via better-sqlite3)                                                                   |
| Full-text search      | SQLite FTS5 (no embeddings)                                                                   |
| Auth                  | better-auth                                                                                   |
| Container             | Single Docker image, multi-arch (amd64/arm64)                                                 |
| PWA                   | Vite PWA plugin, installable, offline shell                                                   |
| LLM provider packages | `@ai-sdk/anthropic`, `@ai-sdk/openai-compatible` (covers OpenAI, OpenRouter, LM Studio, etc.) |

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                     Docker Container                     │
│                                                          │
│  SvelteKit (Node adapter)                                │
│    ├─ /lib/server  (auth, db, llm, mcp, agents, memory)  │
│    └─ routes (UI + API)                                  │
│                                                          │
│  AI SDK (server):                                        │
│    provider registry → streamText/generateText          │
│    MCP clients (stdio + HTTP/SSE) via ai SDK             │
│                                                          │
│  SQLite (file at /data/ai-chat.db)                       │
│  FTS5 virtual tables for memory + chat search            │
│                                                          │
│  Bundled stdio MCP servers:                              │
│    webfetch, datetime, memory, chat-search, documents,   │
│    bash (scoped), settings                               │
│                                                          │
│  Volumes (mounted):                                      │
│    /data        → sqlite db                              │
│    /memory      → per-user + shared OKF bundles          │
│    /documents   → shared documents volume (MCP-managed)  │
│    /workspaces  → per-conversation working folders       │
└──────────────────────────────────────────────────────────┘
```

### 3.1 Volume layout

| Path                             | Purpose                                                                             | Backed up?     |
| -------------------------------- | ----------------------------------------------------------------------------------- | -------------- |
| `/data/ai-chat.db`               | Users, conversations, messages, agents, settings, MCP config, FTS indexes           | yes            |
| `/memory/<user_id>/`             | Per-user OKF bundle (markdown + frontmatter)                                        | yes            |
| `/memory/shared/`                | Admin-curated shared OKF bundle                                                     | yes            |
| `/documents/`                    | Shared documents volume; AI-managed via the `documents` MCP                         | yes            |
| `/workspaces/<conversation_id>/` | Per-conversation temp file area, auto-created on first chat, GC'd after N days idle | no (ephemeral) |

### 3.2 SQLite schema (high-level)

- `users`, `sessions`, `accounts` (better-auth)
- `conversations` (id, user_id, title, mode, model, system_prompt, memory_enabled, created_at, updated_at)
- `messages` (id, conversation_id, role, content, tool_calls, tool_results, attachments, created_at)
- `attachments` (id, message_id, kind, path, mime, sha256)
- `agents` (id, user_id, name, system_prompt, model, trigger_type, trigger_config, last_run, status)
- `agent_runs` (id, agent_id, started_at, ended_at, status, logs, output_path)
- `memory_writes` (id, user_id, conversation_id, concept_path, action, created_at) — audit log of memory mutations
- `api_keys` (id, user_id, label, hash, scopes, created_at, last_used)
- `providers` (id, name, type, base_url, api_key_encrypted, enabled)
- `models` (id, provider_id, model_id, display_name, capabilities, is_default_for)
- `mcp_servers` (id, name, transport, command/url, env_encrypted, enabled, scopes)
- `settings` (key, value) — global app settings

All user-scoped rows are filtered by `user_id` at the repository layer; admin actions bypass the filter only for settings/provider/MCP tables.

---

## 4. AI Inference

### 4.1 Library

- **Vercel AI SDK v5** (`ai` + `@ai-sdk/svelte`) is the single inference layer. No direct per-provider HTTP calls anywhere in the codebase.
- Provider packages: `@ai-sdk/anthropic` for Anthropic; `@ai-sdk/openai-compatible` for all OpenAI-compatible endpoints (OpenAI, OpenRouter, Groq, Together, LM Studio, etc.).
- A central **provider registry** (`/lib/server/llm/registry.ts`) builds AI SDK provider instances from the `providers` + `models` tables (decrypting keys server-side) and returns `LanguageModel` instances by `(provider_id, model_id)`.

### 4.2 Usage by feature

| Feature                            | AI SDK API                                                                                                                   | Notes                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Chat (Chat mode)                   | `streamText` with `stopWhen: stepCountIs(5)` for bounded tool use; streamed to the browser via `createUIMessageStream` (SSE) | tool calls surfaced to UI        |
| Chat (Agent mode)                  | `streamText` with tools + `stopWhen: stepCountIs(N)` (default N=25, configurable per conversation)                           | long-running multi-step loop     |
| Persona agents (§11.2.1)           | same as chat; persona system prompt + bound skill bodies injected                                                            | model override if configured     |
| Scheduled/HTTP/manual agent runs   | `streamText` in a background task; steps persisted as they complete                                                          | resumable run view               |
| Deep research                      | agent loop with the research persona prompt; rounds = bounded `stopWhen` cycles                                              | final report via `generateText`  |
| Memory extraction                  | Built-in scheduled agent (§8.2) running the standard agent loop with the memory model; writes via the `memory` MCP tools     | no dedicated extraction job      |
| Title generation for conversations | `generateText` (short prompt)                                                                                                | runs after first assistant reply |

### 4.3 Tools

- AI SDK `tool()` definitions wrap each MCP tool: `inputSchema` (Zod), `execute` (proxies to the MCP client), plus app-level metadata (display name, icon, transparency flags).
- **MCP integration**: the AI SDK's MCP client (`experimental_createMCPClient`) connects to both bundled stdio servers and user-configured HTTP/SSE remote servers (§13.1). Tool sets are merged into the per-run registry (§13.4).

### 4.4 Client integration

- `@ai-sdk/svelte`'s `Chat` class drives the chat UI state (messages, streaming parts, status) from `+page.server.ts` / API routes.
- Message parts (`text`, `reasoning`, `tool`, `file`) map directly to the timeline components (§5.6), preserving part-level ordering for rendering and persistence.
- Server sends `UIMessage` parts; the client renders them incrementally. On reload, persisted messages are rehydrated into the same `Chat` state.

### 4.5 Error & abort handling

- `streamText` errors are caught server-side, persisted on the message (status `failed`, error text), and surfaced as an inline card with a Retry action.
- Client "Stop" calls the abort endpoint; the server aborts the in-flight stream via `AbortController` and persists the partial message.
- Per-tool retries (§11.5) are implemented in the tool wrapper (exponential backoff, default 2).

---

## 5. Design & UI

### 5.1 Principles

- **Minimal**: no decorative chrome, no gradients, no superfluous imagery. Surfaces, borders, and spacing do the work.
- **Transparent**: every AI action that is not a plain token emission (tool calls, memory writes, research steps, skill loads, agent runs) is rendered as a visible, inspectable element in the timeline.
- **Calm**: status changes use subtle motion; never block the UI on background work; persist progress across reloads.

### 5.2 Component libraries

- [shadcn-svelte](https://shadcn-svelte.com) is the base component library. Components are copied into the repo under `src/lib/components/ui/` (per shadcn-svelte conventions) so they can be customized freely rather than depended upon as a package.
- [sv-prompt-kit](https://sv-prompt-kit.vercel.app) provides the AI-conversation-specific components (also copy-in via the shadcn-svelte CLI, registry `https://sv-prompt-kit.vercel.app/r/*.json`). It builds on shadcn-svelte, so theming and tokens are shared. Installed under `src/lib/components/ai/`.
- Tailwind CSS for styling, using shadcn-svelte's default token system (CSS variables for `background`, `foreground`, `muted`, `border`, `primary`, etc.). A minimal extra token layer adds semantic names (`surface-elevated`, `status-running`, `status-done`, `status-failed`) layered on top of the shadcn palette.
- Icons: `lucide-svelte` (shadcn-svelte's default icon set).

### 5.3 Component mapping

**Base app areas (shadcn-svelte):**

| Area                  | Components                                                                             |
| --------------------- | -------------------------------------------------------------------------------------- |
| Top bar               | `Select`, `Switch` (memory toggle), `DropdownMenu`, `Tabs` (mode toggle)               |
| Conversation sidebar  | `Sheet` (mobile slide-over), `Command` (search), `ContextMenu` (rename/delete)         |
| Settings              | `Form` (sveltekit-superforms over shadcn inputs), `Tabs`, `Switch`, `Dialog` (confirm) |
| Agents / Skills lists | `DataTable` (TanStack Table over shadcn), `Dialog`, `Sheet` (editor drawer)            |
| Memory browser        | `Tree` (custom, shadcn-styled), `Resizable` (split view), `ScrollArea`                 |
| Toasts / status       | `Sonner` (shadcn-svelte's toast), `Alert`                                              |

**AI conversation areas (sv-prompt-kit):**

| Area               | Components                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| Chat scaffolding   | Full Chatbot primitive (used as the starting reference for the chat route)                             |
| Message timeline   | `ChatContainer`, `Message`, `SystemMessage`, `Avatar` (shadcn), `ScrollButton`                         |
| Markdown rendering | `Markdown` (headings, lists, tables, fenced code with syntax highlighting)                             |
| Tool calls / steps | `Steps` + `ChainOfThought` for multi-step agent/research traces; `Source` for cited URLs               |
| Reasoning          | `Reasoning` collapsible (renders the provider's reasoning part)                                        |
| Input              | `PromptInput` (text, attachments, submit, model/persona menu), `PromptSuggestion` chips on empty state |
| File/image upload  | `FileUpload`, `Image` (rendering inline image parts)                                                   |
| Loading states     | `Loader`, `TextShimmer` (streaming placeholder), `ThinkingBar` (agent-mode long tasks)                 |
| Message feedback   | `FeedbackBar` (copy, regenerate, read-aloud)                                                           |

Where sv-prompt-kit lacks a needed component (e.g. the unified tool-call card in §5.6), a custom component is built in the same style and lives beside them in `src/lib/components/ai/`.

### 5.4 Theming

- Light / Dark / System via the `mode-watcher` library (shadcn-svelte's recommended companion).
- Default theme: neutral grays, single accent color (configurable in Settings → General).
- High-contrast considerations: borders ≥ 1px on muted backgrounds; status colors (`running`/`done`/`failed`) meet WCAG AA against `background`.

### 5.5 Layout system

- App shell: left collapsible sidebar (`Sheet` on mobile), top bar, main scroll area, bottom-anchored input on chat routes.
- Settings, agents, skills, memory, research use a standard page width (max-w-5xl) with `Tabs` for sub-areas.
- Resizable panes (`Resizable`) for memory browser (tree | content | history) and agent run view (timeline | logs).

### 5.6 Transparency primitives

- A shared `<ToolCallCard>` Svelte component renders any tool invocation uniformly across chat, agent runs, and research — name, args (syntax-highlighted), result (with truncation + "show full"), status pill, duration, retry count. Uses sv-prompt-kit `Steps`/`ChainOfThought` styling cues.
- A shared `<StepList>` component renders ordered sequences of `<ToolCallCard>` for agent runs and research rounds.
- A shared `<AuditEntry>` component renders memory writes and skill invocations in their respective UIs with the same visual language.

---

## 6. Authentication & Authorization

### 6.1 better-auth configuration

- Email/password login (toggle via `ENABLE_PASSWORD_LOGIN`, default `true`).
- Sign-up (toggle via `ENABLE_SIGNUP`, default `true`).
- OIDC provider (optional). When `OIDC_ONLY=true`, password login and sign-up are disabled and OIDC is the only path.
- OIDC config via env: `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_SCOPES`.

### 6.2 Roles

- `user` — manages own account, uses all features.
- `admin` — additionally manages: providers, models, MCP servers, app settings, and the shared memory bundle. Cannot reset passwords, disable, or role-swap other users (settings-only admin). First registered user is auto-promoted to admin when `AUTO_PROMOTE_FIRST_USER=true` (default `true`).

### 6.3 API keys

- Each user can create/revoke personal API keys in Settings → API Keys.
- Keys authenticate the public HTTP trigger endpoint for agents (scoped to that user's agents).
- Keys are hashed at rest (argon2id); raw value shown once on creation.

---

## 7. Chat Interface

### 7.1 Core behaviors

- Streaming responses (SSE) via `@ai-sdk/svelte`'s `Chat` class (§4.4).
- Per-message markdown rendering via sv-prompt-kit `Markdown`: headings, lists, tables, fenced code with syntax highlighting, blockquotes, inline code.
- Tool-use / step transparency: each tool call renders as a collapsible card showing tool name, arguments, result, duration, and retries. Intermediate reasoning (if exposed by provider) shown under a separate `Reasoning` toggle.
- Stop generation button (aborts the stream, §4.5). Regenerate response. Edit a previous user message → AI re-runs from that point; later messages in the conversation are discarded and replaced.

### 7.2 Per-conversation controls (top bar)

- Model picker (lists all enabled models from all providers, grouped by provider).
- Mode toggle: `Chat` (default, single-turn tool use) ↔ `Agent` (long-running tool loop).
- Memory toggle: "Include long-term memory" (default on). When off, the `search_memory` tool is not registered for this conversation and the system prompt omits memory instructions.
- System prompt override (optional, per conversation).
- Advanced: temperature, max tokens (collapsible).

### 7.3 Input

- sv-prompt-kit `PromptInput`: multi-line text, `Cmd/Ctrl+Enter` to send, attachment chips, model/persona menu trigger.
- `PromptSuggestion` chips on the empty state (e.g. "Summarize today's news", "Start deep research…").
- Image upload (drag-drop or picker, `FileUpload`). Images are sent only to vision-capable models; if the selected model doesn't support vision, the picker warns and offers to switch.
- Speech-to-text via the browser **Web Speech API** on supported devices; mic button in the input bar. No server-side STT.
- Attachments stored under `/workspaces/<conversation_id>/attachments/`.

### 7.4 Text-to-speech

- Read-aloud button per assistant message (in `FeedbackBar`) using the browser **Web Speech API** (`speechSynthesis`). No server TTS.

### 7.5 Conversation history sidebar

- Toggleable left sidebar, collapsible. Lists conversations grouped by date (Today / Yesterday / This week / Older).
- Search across conversations (FTS5 over titles + message contents).
- Pin/star, rename, delete. Delete is soft for 30 days then purged.

### 7.6 Mobile

- Responsive layout: sidebar becomes a slide-over drawer; input bar sticks to bottom; tool-call cards stack vertically.
- PWA: installable, theme color, maskable icon, splash screen, offline shell serving cached history. Chat itself requires network (LLM call).

---

## 8. Long-Term Memory

### 8.1 Storage format

- OKF v0.1 bundles (markdown + YAML frontmatter), one bundle per user at `/memory/<user_id>/`, plus an admin-curated shared bundle at `/memory/shared/`.
- Per-conversation memory writes are forbidden; memory always lands in the user's bundle (and optionally the shared bundle for admin-flagged entries).
- Files on disk are the source of truth; the SQLite FTS5 index is derived from them and reconciled on boot (plus a manual reindex in Settings → Memory).

### 8.2 Write flow (scheduled extraction agent)

1. Extraction is a built-in system agent (`memory-extraction`) using the standard agent machinery (§11) — no dedicated job code. It runs on a cron schedule (`MEMORY_EXTRACT_SCHEDULE`, default `*/15 * * * *`); the "Extract memory now" button is just its manual trigger.
2. Each run passes over users with conversations updated since the agent's `last_run`, executing one pass per user with that user's caller context (so `chat-search` and `memory` MCP calls scope to the right bundle). The agent uses the **memory model** (Settings → Models).
3. The agent's prompt instructs it to distill recent conversations into OKF concepts — frontmatter (`type`, `title`, `description`, `tags`, `timestamp`) + structured markdown body with cross-links to existing concepts — and write them via `create_concept` / `update_concept`. Each write is recorded in `memory_writes` (audit log) with `action ∈ {create, update, delete}`.
4. The `memory` MCP write path regenerates `index.md` files for affected directories and updates the FTS5 index.

### 8.3 Retrieval (AI-tool based)

- The `memory` MCP tool exposes: `search_memory(query, limit)`, `read_concept(id)`, `list_concepts(prefix?)`, `create_concept(...)`, `update_concept(...)`, `delete_concept(id)`.
- `search_memory` runs an FTS5 `MATCH` query over frontmatter+body across the user's bundle and (if enabled) the shared bundle; returns ranked concept IDs, titles, descriptions, and snippet.
- The AI is instructed in the system prompt to call `search_memory` early in a conversation. No memory is auto-injected.
- The chat UI surfaces when memory was searched (tool-call card), which concepts were read, and offers a "view in memory UI" link.

### 8.4 Memory curation UI

- `/memory` route: tree view of the bundle (directories → concepts), with the rendered markdown, the frontmatter as an editable form, and a history panel showing `memory_writes` entries for that concept (with restore).
- Admins see `/memory/shared` in addition to their own.
- Edits update the file, the FTS5 index, and append to `memory_writes`.
- Bulk actions: search by tag/type/text, delete, move (rename path), re-tag.

### 8.5 Transparency

- Every memory mutation (auto or manual) is visible in the audit log with author (`system` vs `user:<id>`), conversation source, and diff.

---

## 9. Skills

Skills are reusable instruction/workflow packs (markdown + optional reference files) that the AI loads on demand to perform a specialized task in a consistent way — analogous to Claude Code skills. A skill is _not_ a tool; it is a body of instructions and reference material that is injected into the model's context when the skill is active.

### 9.1 Anatomy of a skill

A skill is a directory:

```
/skills/<skill-id>/
├── skill.md            # REQUIRED. Frontmatter + instructions body.
└── references/         # OPTIONAL. Extra markdown the skill can pull in on demand.
    └── *.md
```

`skill.md` frontmatter:

```yaml
---
name: <unique id> # REQUIRED
title: <human-readable title> # REQUIRED
description:
  <one-line summary> # REQUIRED. Used by AI for auto-invocation
  # decisions and by the picker for display.
triggers: # OPTIONAL. Hard hints the auto-invoker uses.
  - keyword: 'translate'
  - intent: 'explain code'
when: <natural-language predicate> # OPTIONAL. Free-text guidance for the model.
tools:
  [webfetch, search_memory] # OPTIONAL. Tools the skill expects to be
  # available; runtime verifies they are registered.
enabled: true # OPTIONAL (default true). Toggled from /skills.
source: user # OPTIONAL. Set by the app: `bundled` | `user` | `git:<repo>`.
version: '1.0.0' # OPTIONAL. Informational only.
author: <string> # OPTIONAL
---
```

The body is the instruction/workflow text the AI receives when the skill is loaded.

### 9.2 Storage & scoping

- Per-user skills: `/memory/<user_id>/skills/` (co-located with the user's OKF bundle so skills travel with their personal memory backup).
- Shared skills (admin-promoted): `/memory/shared/skills/`.
- Bundled default skills ship inside the image at `/app/skills/defaults/` and are read-only; on first boot they are copied into `/memory/shared/skills/` if not already present so admins can edit them.
- Files on disk are the source of truth — there is no `skills` DB table; the runtime scans these directories (which also makes git import and manual file drops trivially work).

### 9.3 Sources

1. **Bundled defaults** — shipped with the app. Initial set:
   - `summarize-conversation`
   - `translate`
   - `explain-code`
   - `draft-email`
   - `extract-action-items`
   - `plan-and-execute` (canonical agent-mode workflow)
2. **User-authored** — created/edited via `/skills` in the UI (markdown editor + frontmatter form).
3. **Git import** — `Import from git` in `/skills`: enter a repo URL (+ optional branch/path). The app clones into a temp dir, validates each `skill.md` (frontmatter parseable, `name` unique within the repo), and copies valid skills into the user's skill directory. Re-importing the same repo updates in place and preserves local edits under a `.local` suffix. Supported: public git URLs and private URLs with an embedded token or a configured deploy key.

### 9.4 Invocation

- **Auto**: the runtime adds a short `Available skills` index (names + descriptions) to the system prompt and exposes a `load_skill(name)` MCP tool. The AI calls `load_skill` when it judges a skill is relevant; the tool returns the skill body (and the names of reference files, which the AI may then read via the `read_skill_reference` tool).
- **Manual**: typing `/skill <name>` (or selecting from the `/skills` picker in the input bar) forces a load for that turn. Both paths log a skill-load event in the message timeline (visible card).

### 9.5 Skill management UI

- `/skills` route: list view (name, description, source from frontmatter/location, enabled), with enable/disable toggle (writes the frontmatter flag), edit, duplicate, delete, import-from-git.
- Admins see a "Promote to shared" action on any user skill.
- A skill detail view shows the rendered `skill.md`, references tree, version, and usage log (which conversations invoked it).

### 9.6 Runtime behavior

- Loading a skill injects only that skill's body into context (not all skills). Reference files are loaded on demand by the AI via `read_skill_reference(name, path)`.
- If a skill declares `tools:` the runtime verifies each is registered for the current conversation/mode; missing tools are surfaced as a warning to the user (chat continues; AI is told the tool is unavailable).

### 9.7 Schema (additions)

Skills themselves are files on disk (§9.2) and have no DB table. Only the invocation audit log is stored:

- `skill_invocations` (id, skill_name, scope `user`|`shared`, user_id, conversation_id, message_id, triggered_by `auto`|`manual`|`agent`, created_at)

---

## 10. Deep Research

- Implementation: **agent mode with a research-focused system prompt** and the same agent loop (§4.2). No separate engine.
- The research persona prompt instructs the model to: break the question into sub-questions, iterate (search → read → refine), cite sources, and produce a final markdown report.
- Tools available to the research persona: `webfetch`, `search_memory`, `read_concept`, `list_concepts`, `chat-search` (search previous conversations), `datetime`.
- UI: a dedicated `/research` route that runs a research session and shows:
  - The live step list (sv-prompt-kit `ChainOfThought`/`Steps`, same transparency language as chat).
  - A "rounds" indicator (a round = one full plan→search→synthesize pass). User can configure max rounds; default 5.
  - The final report rendered as markdown, with citations as footnote links (sv-prompt-kit `Source`). Exportable as `.md`.
- Research outputs (intermediate notes + final report) are saved as a concept in the user's memory bundle of `type: Research Report`, linked back to the originating chat.

---

## 11. Agents

### 11.1 Definition

- An agent = (system prompt, model, tool allow-list, trigger, bound skills).
- Created/edited in `/agents`. Owned by the creating user.
- An agent may bind one or more **skills** (§9). When the agent runs, its bound skills' bodies are pre-loaded into the system prompt (instead of waiting for `load_skill` to be invoked), and the skills' declared tools are guaranteed to be registered.

### 11.2 Triggers

1. **Chat persona** — the agent is selectable in the chat UI's model picker / persona menu (§7.2). Starting a conversation with a persona applies its system prompt, skill bindings, tool allow-list, and (optional) model override for the whole conversation. Switching persona mid-conversation re-applies the new prompt; the prior messages are retained. Example: a "Meal Planner" agent whose system prompt instructs it to follow the `plan-meals` skill and use `search_memory` + `documents` to maintain a recipe store.
2. **Schedule** — cron expression (5-field) with timezone from `TZ` env var (default `UTC`). Stored on the agent; evaluated by an in-process scheduler using node-cron or equivalent. Persisted across restarts via `next_run_at`.
3. **HTTP** — each agent exposes `POST /api/agents/:id/run` requiring an `Authorization: Bearer <api_key>` whose owner is the agent's owner. Returns `run_id`; client can poll `/api/agent-runs/:id` or subscribe via SSE.
4. **Manual** — "Run now" button in the agent editor.

### 11.3 Execution environment

- **Persona** runs share the conversation's workspace `/workspaces/<conversation_id>/` (no separate run-id folder).
- **Schedule / HTTP / Manual** runs use `/workspaces/agent-<agent_id>-<run_id>/`, created per run, GC'd after 30 days.
- Logs (text) and outputs (any files written by tools) saved under the workspace and listed in `/agents/:id/runs`.

### 11.4 Run view

- Per-run page (schedule / HTTP / manual): status, start/end, duration, step list (transparency component), full log, downloadable outputs.
- Conversation-style transcript between the agent and any tools.
- Persona runs have no run page; their steps are visible inline in the chat timeline.

### 11.5 Failure handling

- Retries per tool call (configurable, default 2) with exponential backoff (§4.5).
- Agent run marked `failed` after max retries exhausted; logged with the failing step.

---

## 12. File Storage & Documents

### 12.1 Per-conversation workspace

- `/workspaces/<conversation_id>/` — created on first chat (or agent run). The AI operates here via the `bash` MCP tool (scoped to this path via chroot-style path validation) and via file MCP tools.
- Not surfaced in the UI in v1; reserved for future "Files" tab per conversation.
- Garbage-collected after 30 days idle.

### 12.2 Documents volume

- `/documents/` — a shared, persistent volume the `documents` MCP operates on. Distinct from per-conversation workspaces.
- `documents` MCP tools: `create_document(path, content)`, `read_document(path)`, `update_document(path, content)`, `delete_document(path)`, `search_documents(query)` (FTS5), `list_documents(prefix?)`.
- All paths validated against the volume root; no traversal outside.
- Not user-visible in v1; future "Documents" admin route may expose it.

---

## 13. MCP

### 13.1 Transports

- **stdio** — bundled servers shipped in the image; the app spawns the process and talks JSON-RPC over stdin/stdout.
- **HTTP/SSE** — user-configured remote servers (URL + optional bearer token). Stored in `mcp_servers` with `transport = 'http' | 'sse'`.
- Both are consumed through the AI SDK's MCP client (§4.3), giving one unified tool interface regardless of transport.

### 13.2 Bundled stdio servers (always enabled)

| Server        | Tools                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webfetch`    | `fetch(url, format?)`                                                                                                                                                     |
| `datetime`    | `now(tz?)`, `format(iso, fmt)`, `convert(...)`                                                                                                                            |
| `memory`      | `search_memory`, `read_concept`, `list_concepts`, `create_concept`, `update_concept`, `delete_concept` (operates on caller's bundle + shared)                             |
| `chat-search` | `search_chats(query, limit?)` (FTS5 over the caller's conversations)                                                                                                      |
| `documents`   | `create_document`, `read_document`, `update_document`, `delete_document`, `search_documents`, `list_documents`                                                            |
| `bash`        | `ls`, `grep`, `glob`, `cat`, `head`, `tail`, `wc` scoped to the conversation workspace (or agent workspace). Not a full shell.                                            |
| `settings`    | `get_setting(key)`, `list_settings`. `update_setting(key, value)` ships disabled by default; an admin can enable it in Settings → MCP (remains admin-only, 403 otherwise) |

### 13.3 MCP management UI

- `/settings/mcp`: list enabled servers (bundled + user-added), enable/disable, add remote (HTTP/SSE) server, edit URL/token, test connection, view exposed tools.
- Per-server scopes: which conversation modes / agents may use it.

### 13.4 Tool registration

- On each chat/agent run, the runtime builds the tool list by intersecting (enabled servers) × (mode allow-list) × (per-conversation memory toggle).
- Tool schemas are passed to the LLM provider; tool results are persisted to `messages.tool_results`.

---

## 14. Providers & Models

### 14.1 Providers (admin-managed)

- Anthropic (via `@ai-sdk/anthropic`).
- OpenAI-compatible (via `@ai-sdk/openai-compatible`: base URL + key — covers OpenAI, OpenRouter, Groq, Together, etc.).
- LM Studio (OpenAI-compatible pointed at `http://localhost:1234` by default).
- Each provider has: name, type, base_url, encrypted api_key, enabled flag.
- Adding a provider triggers a "fetch models" call to populate `models`; user can also add model entries manually.

### 14.2 Models

- Each model has: display_name, model_id, provider, capabilities (`chat`, `vision`, `tool_use`, `streaming`).
- Settings → Models page:
  - **Default chat model** (used when a new conversation starts).
  - **Memory model** (used by the memory extraction job; can be a cheaper/faster model).
  - **Default research model**.
  - Per-model enable/disable (so the chat picker only shows what you want).

---

## 15. Settings

### 15.1 Areas

- **General**: app name, theme (light/dark/system), `TZ`.
- **Providers**: manage providers (§14.1).
- **Models**: manage models + role assignments (§14.2).
- **MCP**: manage MCP servers (§13.3).
- **API Keys**: personal API keys for HTTP-triggered agents (§6.3).
- **Memory**: toggle shared-bundle usage, configure extraction schedule, configure memory model (alias to Models page), trigger a manual reindex of FTS5.
- **Skills**: alias to `/skills` (§9.5).
- **Agents**: alias to `/agents` (§11).
- **Account**: change password, manage sessions, export personal data bundle.

### 15.2 Persistence

- Global settings in `settings` table (key/value JSON).
- Per-user preferences stored on `users.preferences` (JSON column).

---

## 16. Environment Variables

| Var                       | Default                 | Description                                                     |
| ------------------------- | ----------------------- | --------------------------------------------------------------- |
| `DATABASE_PATH`           | `/data/ai-chat.db`      | SQLite file path                                                |
| `MEMORY_VOLUME`           | `/memory`               | OKF bundles root                                                |
| `DOCUMENTS_VOLUME`        | `/documents`            | Shared documents volume                                         |
| `WORKSPACES_VOLUME`       | `/workspaces`           | Per-conversation workspaces root                                |
| `WORKSPACE_GC_DAYS`       | `30`                    | Idle days before a workspace is GC'd                            |
| `TZ`                      | `UTC`                   | Container timezone; used by agent scheduler                     |
| `ENABLE_SIGNUP`           | `true`                  | Allow new sign-ups                                              |
| `ENABLE_PASSWORD_LOGIN`   | `true`                  | Allow username/password login                                   |
| `OIDC_ONLY`               | `false`                 | When true, only OIDC login is accepted                          |
| `OIDC_ISSUER`             | —                       | OIDC issuer URL                                                 |
| `OIDC_CLIENT_ID`          | —                       | OIDC client ID                                                  |
| `OIDC_CLIENT_SECRET`      | —                       | OIDC client secret                                              |
| `OIDC_SCOPES`             | `openid profile email`  | OIDC scopes                                                     |
| `AUTO_PROMOTE_FIRST_USER` | `true`                  | First registered user becomes admin                             |
| `MEMORY_EXTRACT_SCHEDULE` | `*/15 * * * *`          | Cron schedule for the built-in memory-extraction agent          |
| `LM_STUDIO_BASE_URL`      | `http://localhost:1234` | Default base URL for the preconfigured LM Studio provider entry |
| `AGENT_MAX_STEPS`         | `25`                    | Default `stopWhen` step cap for agent-mode conversations        |
| `PORT`                    | `3000`                  | HTTP port the app listens on                                    |

Secrets (OIDC client secret, provider API keys) are encrypted at rest with a key derived from `APP_SECRET` (required env var; generated on first run if absent and logged once).

---

## 17. Docker

### 17.1 Image

- Multi-stage build: install deps → build SvelteKit → slim Node runtime image.
- Single image, single process (SvelteKit server) plus internally spawned stdio MCP servers as child processes.
- Volumes: `/data`, `/memory`, `/documents`, `/workspaces`.
- Healthcheck: `GET /api/health`.

### 17.2 Compose example (provided in repo)

- One service, the four volumes, env file, port mapping.

### 17.3 Updates

- Schema migrations run on boot via a versioned migrations table; migrations are forward-only with rollback notes documented.

---

## 18. Transparency & Observability

- Every chat/agent/research session has a full timeline persisted to `messages` (including tool calls and results).
- Memory mutations are auditable (§8.5).
- Agent runs are auditable (§11.4).
- No telemetry leaves the container by default.
- Optional `/admin/logs` (admin only) showing recent runs, errors, and MCP server status.

---

## 19. Security

- All user-scoped data filtered by `user_id` at repository layer.
- API keys hashed with argon2id.
- Provider/MCP secrets encrypted at rest with `APP_SECRET`.
- `bash` MCP restricted to a fixed allow-list of commands and the conversation/agent workspace path; explicit path-prefix validation before every call.
- Remote MCP servers (HTTP/SSE) called server-side only; bearer tokens never reach the browser.
- OIDC token verification per better-auth defaults.
- CSP: strict, no inline scripts (SvelteKit handles nonce), no remote origins except configured provider endpoints and remote MCP servers.

---

## 20. Out of Scope for v1 (candidates for later)

- RAG over user-uploaded documents (chunking + retrieval beyond what `documents` MCP already offers).
- Conversation sharing via public links.
- Token/cost tracking dashboard.
- Model fallback on error.
- Webhook notifications for agent completion.
- Export/import of full backup bundles.
- Agent-to-agent calls.
- A user-visible Documents tab.

These will be revisited after v1 is stable.

---

## 21. Open Questions for Later Review

- Retention policy for `messages.tool_results` (can grow large with verbose tool outputs).
- Whether shared memory bundle writes should require admin approval.
- Whether agent HTTP triggers need rate limiting per key.
- Whether `chat-search` results should include other users' conversations an admin has flagged as shared.
