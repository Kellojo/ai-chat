# AI Chat — Implementation Plan

Companion to `requirements.md`. This plan is organized as milestones (M0–M9) that each leave the app in a working state, followed by the concrete file layout, API surface, schema, and subsystem notes.

Conventions: SvelteKit 2 + Svelte 5 (runes only, no legacy stores/`export let`), TypeScript strict, AI SDK **v5** (`ai@^5`, `@ai-sdk/svelte@^2`), pnpm.

---

## 1. Milestones & sequencing

| #   | Milestone          | Delivers                                                                                                                                   | Exit criteria                                                             |
| --- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| M0  | Scaffold           | SvelteKit app, TS strict, Tailwind, shadcn-svelte, sv-prompt-kit, eslint/prettier, vitest, Docker skeleton                                 | `pnpm dev` boots; CI runs lint+check+tests                                |
| M1  | Config, DB, auth   | env parsing, SQLite + migrations, better-auth (email/pwd, OIDC), roles, hooks                                                              | Sign up / login / logout; first user auto-admin; migrations run on boot   |
| M2  | Providers & models | providers/models CRUD (admin), secret encryption, provider registry, "fetch models"                                                        | Anthropic + OpenAI-compatible provider configurable; model list populates |
| M3  | Chat core          | conversations/messages repos, `/api/chat` streaming, Chat-mode UI (timeline, input, stop/regenerate/edit, sidebar, title gen, attachments) | Full streaming round-trip persisted; reload rehydrates                    |
| M4  | MCP & tools        | MCP client manager, 7 bundled stdio servers + skills server, tool registry, `<ToolCallCard>`                                               | Tool calls render transparently in chat; per-mode allow-lists work        |
| M5  | Agents             | agent CRUD, scheduler, runner, run views, HTTP trigger + API keys                                                                          | Scheduled agent runs end-to-end; steps visible in run view                |
| M6  | Memory             | OKF bundle ops, FTS5 index + boot reconcile, memory MCP backed by real store, extraction agent, `/memory` UI                               | Auto-extraction writes concepts; curation UI edits + audit log            |
| M7  | Skills             | skill scanner/loader, `load_skill` tools, `/skill` manual invoke, git import, `/skills` UI                                                 | Skill loads inject body; git import round-trips                           |
| M8  | Deep research      | research persona + `/research` route, rounds indicator, report export                                                                      | Research run produces cited markdown report saved to memory               |
| M9  | PWA & hardening    | PWA manifest/SW, CSP, SSRF guard, GC jobs, admin logs, backups doc                                                                         | Installable offline shell; security checklist passes                      |

Dependencies: M3 needs M2 (models); M4 before M5 (agents use tools); M5 before M6 (extraction is an agent); M6/M7 before M8 (research uses memory + skills).

---

## 2. Project layout

```
ai-chat/
├── Dockerfile                      # multi-stage, node:22-alpine, multi-arch
├── docker-compose.yml
├── migrations/                     # 0001_init.sql, 0002_*.sql — forward-only
├── skills/defaults/                # bundled default skills (copied to /memory/shared/skills on boot)
├── src/
│   ├── app.html / app.css / hooks.server.ts
│   ├── service-worker.ts           # PWA offline shell (M9)
│   ├── lib/
│   │   ├── server/
│   │   │   ├── config.ts           # zod-validated env (§3)
│   │   │   ├── crypto.ts           # APP_SECRET → KEK (HKDF) → AES-256-GCM encrypt/decrypt
│   │   │   ├── db/
│   │   │   │   ├── index.ts        # better-sqlite3, WAL, busy_timeout, migrate-on-boot
│   │   │   │   ├── migrate.ts      # versioned runner over migrations/
│   │   │   │   └── repo/           # users, conversations, messages, attachments,
│   │   │   │                       # agents, agentRuns, apiKeys, providers, models,
│   │   │   │                       # mcpServers, settings, memoryWrites, skillInvocations
│   │   │   ├── auth/
│   │   │   │   ├── index.ts        # better-auth instance (email/pwd + OIDC, env-toggled)
│   │   │   │   └── guards.ts       # requireUser / requireAdmin / requireApiKey
│   │   │   ├── llm/
│   │   │   │   ├── registry.ts     # (providerId, modelId) → LanguageModel (§5.1)
│   │   │   │   └── systemPrompt.ts # base prompt + memory instructions + skills index
│   │   │   ├── mcp/
│   │   │   │   ├── clientManager.ts# ai-sdk experimental_createMCPClient pool (stdio+HTTP/SSE)
│   │   │   │   └── servers/        # bundled stdio servers (each: index.ts entry)
│   │   │   │       ├── webfetch/  datetime/  memory/  chat-search/
│   │   │   │       ├── documents/ bash/      settings/ skills/
│   │   │   ├── tools/
│   │   │   │   ├── registry.ts     # per-run tool set: enabled × mode × memory toggle (§5.3)
│   │   │   │   └── wrap.ts         # MCP tool → ai-sdk tool(): jsonSchema, retries, metadata
│   │   │   ├── chat/
│   │   │   │   ├── service.ts      # send/abort/regenerate/edit orchestration
│   │   │   │   └── streams.ts      # in-flight AbortController registry
│   │   │   ├── agents/
│   │   │   │   ├── scheduler.ts    # node-cron registration from DB, next_run_at, boot sweep
│   │   │   │   ├── runner.ts       # runAgent(): workspace, loop, persist steps, status
│   │   │   │   └── builtin.ts      # memory-extraction agent seed (§8.2)
│   │   │   ├── memory/
│   │   │   │   ├── bundle.ts       # OKF read/write/move/delete + index.md regen
│   │   │   │   ├── fts.ts          # memory_fts sync, reconcileOnBoot()
│   │   │   │   └── paths.ts        # per-user/shared path resolution + traversal guard
│   │   │   ├── skills/
│   │   │   │   ├── scanner.ts      # scan skill dirs, parse frontmatter, mtime cache
│   │   │   │   └── gitImport.ts    # clone → validate → copy (+ .local preservation)
│   │   │   ├── workspaces.ts       # per-conversation/agent dirs, path validation, GC
│   │   │   └── jobs.ts             # boot + daily: workspace GC, purge soft-deleted convs
│   │   ├── components/
│   │   │   ├── ui/                 # shadcn-svelte (copied in)
│   │   │   ├── ai/                 # sv-prompt-kit (copied in) + custom:
│   │   │   │   ├── ToolCallCard.svelte  StepList.svelte  AuditEntry.svelte
│   │   │   └── app/                # Sidebar, ModelPicker, ModeToggle, MemoryToggle, …
│   │   ├── state/                  # .svelte.ts rune modules (sidebar, toasts helpers)
│   │   └── utils.ts
│   └── routes/
│       ├── (auth)/login/+page.svelte · signup/+page.svelte
│       ├── (app)/+layout.svelte    # shell: sidebar + topbar
│       │   ├── chat/[id]/+page.svelte (+page.ts)
│       │   ├── agents/…  skills/…  memory/…  research/…
│       │   └── settings/+layout.svelte + general|providers|models|mcp|api-keys|memory|account
│       └── api/…                   # §6
└── tests/                          # unit (vitest) + e2e (playwright)
```

---

## 3. Configuration (`lib/server/config.ts`)

- Zod schema over `process.env`, parsed once, cached; fail fast on invalid values.
- `APP_SECRET`: if unset, generate 32 random bytes and persist to `/data/.secret` (mode `0600`), then load from there. **Never log it** (supersedes requirements §16 "logged once").
- Crypto: `KEK = HKDF-SHA256(APP_SECRET, salt=static, info='ai-chat')`; secrets stored as `aes-256-gcm` blobs (`iv.ct.tag` base64) for provider keys, MCP tokens, OIDC secret.

---

## 4. Database

### 4.1 Migration runner

- `migrate.ts` applies `migrations/*.sql` in order, tracked in `_migrations(version)`; runs on boot before anything else; forward-only (rollback notes in file headers per §17.3).
- Pragmas on open: `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`.

### 4.2 Tables (0001_init.sql)

better-auth creates `user`, `session`, `account`, `verification` itself. App tables:

```sql
conversations(id, user_id FK, kind TEXT DEFAULT 'chat',      -- 'chat'|'agent-run'|'research'
  title TEXT, mode TEXT DEFAULT 'chat',                      -- 'chat'|'agent'
  provider_id TEXT, model_id TEXT,
  system_prompt TEXT, memory_enabled INTEGER DEFAULT 1,
  max_steps INTEGER, temperature REAL, max_tokens INTEGER,   -- §7.2 advanced
  pinned INTEGER DEFAULT 0,
  created_at INTEGER, updated_at INTEGER, deleted_at INTEGER) -- soft delete §7.5

messages(id, conversation_id FK, role TEXT,
  parts TEXT NOT NULL,            -- JSON array of UIMessage parts (see note below)
  status TEXT DEFAULT 'complete', -- 'complete'|'partial'|'failed'
  error TEXT, created_at INTEGER)

attachments(id, message_id FK, kind TEXT, path TEXT, mime TEXT, sha256 TEXT)

agents(id, user_id FK NULL,      -- NULL = built-in system agent (memory-extraction)
  name, description, system_prompt, provider_id, model_id,   -- NULL model = caller default
  skill_names TEXT,              -- JSON array of bound skills
  tool_allowlist TEXT,           -- JSON array, NULL = all registered
  trigger_type TEXT,             -- 'persona'|'schedule'|'http'|'manual'
  trigger_config TEXT,           -- JSON {cron: "*/15 * * * *"}
  enabled INTEGER DEFAULT 1, last_run_at INTEGER, next_run_at INTEGER,
  created_at, updated_at)

agent_runs(id, agent_id FK, user_id, trigger TEXT,
  conversation_id FK,            -- transcript stored as hidden conversation (see note)
  status TEXT DEFAULT 'running', -- 'running'|'success'|'failed'
  error TEXT, started_at, ended_at)

memory_writes(id, user_id, conversation_id NULL, agent_run_id NULL,
  concept_path TEXT, action TEXT,        -- 'create'|'update'|'delete'
  author TEXT,                           -- 'system' | 'user:<id>' | 'agent:<id>'
  diff TEXT, created_at)                 -- unified diff for restore (§8.5)

api_keys(id, user_id FK, label, hash TEXT, scopes TEXT, created_at, last_used_at)
providers(id, name, type TEXT, base_url TEXT, api_key_enc TEXT, enabled INTEGER DEFAULT 1)
models(id, provider_id FK, model_id, display_name, capabilities TEXT, -- JSON
  enabled INTEGER DEFAULT 1, is_default_for TEXT)                     -- 'chat'|'memory'|'research'|NULL
mcp_servers(id, name, transport TEXT, command TEXT, args TEXT, url TEXT,
  token_enc TEXT, enabled INTEGER DEFAULT 1, scopes TEXT, builtin INTEGER DEFAULT 0)
settings(key TEXT PRIMARY KEY, value TEXT)   -- JSON values
skill_invocations(id, skill_name, scope TEXT, user_id, conversation_id,
  message_id, triggered_by TEXT, created_at)

-- FTS5 (contentless-delete, rebuilt from source on demand):
messages_fts(conversation_id UNINDEXED, content)      -- + triggers on messages insert/update
memory_fts(scope UNINDEXED, path UNINDEXED, title, description, tags, body)
documents_fts(path UNINDEXED, content)
```

Two deliberate simplifications vs. requirements §3.2 (flagging, easy to revert):

1. **`messages.parts` JSON** instead of separate `content`/`tool_calls`/`tool_results` columns — §4.4 already requires part-level ordering for rendering and persistence; storing v5 `UIMessage.parts` verbatim is the honest representation. Plain text is duplicated into `messages_fts` for search.
2. **Agent-run transcripts are conversations** (`kind='agent-run'`, hidden from sidebar) — reuses messages/parts persistence and the timeline UI for run views (§11.4) instead of a parallel log format.

Schema completions required by the spec's own text (not new features): `deleted_at` (§7.5), `max_steps/temperature/max_tokens` (§7.2), `memory_writes.author/diff` (§8.5).

### 4.3 Repository layer

- One module per table in `db/repo/`, plain functions over prepared statements.
- **All** user-scoped queries take `userId` as first arg and filter in SQL (§19). Admin tables (`providers`, `models`, `mcp_servers`, `settings`) live behind `requireAdmin` at the route layer instead.
- No ORM; ~30 queries total, hand-written SQL is smaller than drizzle's setup here. Revisit if queries grow.

---

## 5. Server modules — key APIs

### 5.1 LLM registry (`llm/registry.ts`)

```ts
resolveModel(ref: { providerId: string; modelId: string }): LanguageModel      // throws if disabled
listEnabledModels(): GroupedByProvider[]                                       // for pickers
roleModel(role: 'chat' | 'memory' | 'research'): LanguageModel                 // §14.2 defaults
fetchProviderModels(providerId: string): Promise<string[]>                     // /models probe
```

- Builds `@ai-sdk/anthropic` / `createOpenAICompatible()` instances from DB rows, decrypting `api_key_enc` in-process only. Instances cached per provider id; cache busted on provider update.

### 5.2 Tool registry (`tools/registry.ts`)

```ts
buildTools(ctx: {
  user: User; mode: 'chat' | 'agent';
  memoryEnabled: boolean; agentAllowlist?: string[];
}): Promise<Record<string, Tool>>
```

- Sources: all enabled MCP servers (bundled stdio + remote HTTP/SSE from `mcp_servers`).
- Filters: server scopes × mode allow-list × (`memoryEnabled === false` ⇒ drop `memory` server tools) × `agentAllowlist`.
- Each MCP tool wrapped (`tools/wrap.ts`): `inputSchema: jsonSchema(mcpTool.inputSchema)`, `execute` → MCP `callTool` with per-tool retry (exponential backoff, default 2, §11.5), plus app metadata (display name, icon) carried in a sidecar map keyed by tool name for `<ToolCallCard>`.

### 5.3 MCP client manager (`mcp/clientManager.ts`)

- Pool of `experimental_createMCPClient` instances: stdio servers spawned once at boot as child processes (`node dist/mcp/<name>.js`; `tsx` in dev), HTTP/SSE clients per config row.
- **v1 deviation (approved)**: bundled servers run **in-process** via the MCP SDK's `InMemoryTransport` (ai v7 MCP client moved to `@ai-sdk/mcp` and accepts any MCP transport). Caller context is closure-captured per connection instead of spawn env; connections are per-run, closed at stream end (no pool). Crash isolation from the app is traded for much simpler lifecycle/testing. The `bash` server's tools are pure-Node implementations (no `execFile`) so they work cross-platform. Revisit stdio if third-party bundled servers appear.
- Health check + `testConnection(serverId)` for the settings UI; reconnect with backoff on stdio crash.
- Bundled servers are plain MCP SDK servers (`@modelcontextprotocol/sdk`) in `mcp/servers/*`, each <150 LOC:

| Server        | Notes                                                                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `webfetch`    | fetch → readable markdown; **SSRF guard**: block loopback/RFC1918/link-local unless `WEBFETCH_ALLOW_PRIVATE=true` (see §11 decisions)        |
| `datetime`    | `now/format/convert` via luxon, `TZ` default                                                                                                 |
| `memory`      | CRUD + search over `memory/bundle.ts` + `fts.ts`; scoped to caller user passed via spawn env                                                 |
| `chat-search` | FTS5 over caller's conversations only                                                                                                        |
| `documents`   | CRUD + search under `/documents`, path-prefix validated                                                                                      |
| `bash`        | `execFile` with fixed allow-list (`ls grep glob cat head tail wc`), no shell, `cwd` = caller workspace, arg paths validated inside workspace |
| `settings`    | `get_setting`, `list_settings`; `update_setting` present but **disabled by default** (config flag + admin-only)                              |
| `skills`      | `load_skill(name)`, `read_skill_reference(name, path)` — new bundled server; spec §9.4 says "an MCP tool" without assigning a server         |

Caller context (user id, workspace path) is passed to stdio servers via spawn env — every MCP call inherits the right scoping without trusting model-supplied args.

### 5.4 Agents (`agents/runner.ts`, `agents/scheduler.ts`)

```ts
runAgent(agent: Agent, trigger: Trigger, forUserId?: string): Promise<AgentRun>
```

- Creates run row + hidden transcript conversation + workspace (`/workspaces/agent-<id>-<runId>/`), then the same `streamText` loop as chat with `stopWhen: stepCountIs(agent.maxSteps ?? env.AGENT_MAX_STEPS)`.
- Parts persisted incrementally via `onStepFinish` (resumable _view_, §4.2); crash recovery: boot sweep marks `running → failed` (resume of half-finished runs is out of scope for v1 — see §11).
- Scheduler: node-cron, one registration per enabled schedule-agent, `next_run_at` persisted; on boot, run any agent whose `next_run_at` is in the past once, then re-register.
- `builtin.ts` seeds the `memory-extraction` agent (`user_id NULL`, cron from `MEMORY_EXTRACT_SCHEDULE`); runner executes it **once per user with activity since `last_run_at`**, passing that user as caller context (§8.2).

### 5.5 Memory (`memory/bundle.ts`, `memory/fts.ts`)

- `bundle.ts`: `read/write/move/delete concept`, frontmatter via `gray-matter`; every mutation → `memory_writes` row (author, unified diff) + `index.md` regen + FTS upsert. Files are source of truth (§8.1).
- `fts.reconcileOnBoot()`: walk bundles, upsert changed/deleted rows (covers external edits on mounted volumes). Manual reindex endpoint reuses it.
- `paths.ts`: all concept paths normalized + rejected if escaping `<root>/<user_id>/` or `/memory/shared/`.

### 5.6 Skills (`skills/scanner.ts`, `skills/gitImport.ts`)

- Scanner: readdir of `/memory/<uid>/skills` + `/memory/shared/skills`, parse `skill.md` frontmatter (zod), cache by mtime. No DB table (§9.7).
- `load_skill` resolves name → scope (user wins over shared) → returns body + reference listing; logs `skill_invocations`.
- Git import: `isomorphic-git` (pure JS, no git binary in image) shallow-clone to temp → validate → copy; re-import preserves `*.local` files; sets frontmatter `source: git:<repo>`.

### 5.7 Workspaces & GC (`workspaces.ts`, `jobs.ts`)

- `ensureWorkspace(kind, id)`; `assertInside(root, candidate)` used by bash/documents servers.
- `jobs.ts`: on boot + every 24h — GC idle workspaces (`WORKSPACE_GC_DAYS`), purge conversations soft-deleted >30d, GC agent run workspaces >30d.

---

## 6. API surface

Auth handled by better-auth at `POST/GET /api/auth/*` (handler delegates to the better-auth instance). Everything below requires a session unless noted; admin rows marked 🔒.

| Route                                 | Methods            | Purpose                                                                                           |
| ------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| `/api/chat`                           | POST               | Stream a turn (UI message stream, §7.1). Body: `{ conversationId, messages }`                     |
| `/api/chat/[id]/abort`                | POST               | Abort in-flight stream for conversation                                                           |
| `/api/conversations`                  | GET, POST          | List (sidebar, grouped) / create                                                                  |
| `/api/conversations/[id]`             | GET, PATCH, DELETE | Load + messages; update (title, mode, model, system prompt, memory toggle, advanced); soft delete |
| `/api/conversations/[id]/pin`         | POST               | Toggle pin                                                                                        |
| `/api/conversations/search`           | GET                | `?q=` FTS5 over titles + message text                                                             |
| `/api/conversations/[id]/attachments` | POST               | Multipart upload → workspace `attachments/` (size/type limits, §11)                               |
| `/api/providers` 🔒                   | GET, POST          | List / create                                                                                     |
| `/api/providers/[id]` 🔒              | PATCH, DELETE      | Update (re-encrypts key), delete                                                                  |
| `/api/providers/[id]/fetch-models` 🔒 | POST               | Probe provider, upsert `models`                                                                   |
| `/api/models`                         | GET                | Enabled models grouped by provider (any user; picker)                                             |
| `/api/models/[id]` 🔒                 | PATCH              | enable/disable, display name, capabilities, `is_default_for`                                      |
| `/api/mcp-servers` 🔒                 | GET, POST          | List / add remote                                                                                 |
| `/api/mcp-servers/[id]` 🔒            | PATCH, DELETE      | Update, delete                                                                                    |
| `/api/mcp-servers/[id]/test` 🔒       | POST               | Test connection, list exposed tools                                                               |
| `/api/agents`                         | GET, POST          | Own agents list / create                                                                          |
| `/api/agents/[id]`                    | GET, PATCH, DELETE | Owner-scoped                                                                                      |
| `/api/agents/[id]/run`                | POST               | **HTTP trigger** — accepts session _or_ `Authorization: Bearer <api_key>` (§11.2)                 |
| `/api/agents/[id]/runs`               | GET                | Run history                                                                                       |
| `/api/agent-runs/[id]`                | GET                | Run detail incl. transcript conversation id                                                       |
| `/api/api-keys`                       | GET, POST          | List (label/last_used) / create (raw shown once)                                                  |
| `/api/api-keys/[id]`                  | DELETE             | Revoke                                                                                            |
| `/api/memory/tree`                    | GET                | Bundle tree (`?scope=shared` for admins)                                                          |
| `/api/memory/concept`                 | GET, PUT, DELETE   | Read / edit / delete by path (writes audit rows)                                                  |
| `/api/memory/search`                  | GET                | `?q=` FTS5 (UI-side search)                                                                       |
| `/api/memory/writes`                  | GET                | Audit log (`?path=` filter)                                                                       |
| `/api/memory/reindex` 🔒              | POST               | Rebuild memory FTS                                                                                |
| `/api/memory/extract`                 | POST               | Manual trigger of extraction agent ("Extract memory now")                                         |
| `/api/skills`                         | GET, POST          | List (user+shared) / create                                                                       |
| `/api/skills/[name]`                  | GET, PUT, DELETE   | Read/edit/delete (`?scope=`)                                                                      |
| `/api/skills/import`                  | POST               | `{ gitUrl, branch?, path? }`                                                                      |
| `/api/skills/[name]/promote` 🔒       | POST               | Copy user skill → shared                                                                          |
| `/api/research`                       | POST               | Start research session → `{ runId }` (backed by research persona agent)                           |
| `/api/settings` 🔒                    | GET, PUT           | Global settings (per-user prefs live on `users.preferences` via better-auth hook)                 |
| `/api/admin/logs` 🔒                  | GET                | Recent runs/errors/MCP status (§18)                                                               |
| `/api/health`                         | GET                | unauthenticated, docker healthcheck                                                               |

Non-chat mutations are plain JSON endpoints consumed via `fetch` + `invalidateAll` / targeted `depends`. SvelteKit remote functions are a future option; REST keeps the agent HTTP trigger and PWA cache model boring and explicit.

---

## 7. Chat streaming pipeline (core flow)

```
Client (Chat class) ──POST /api/chat──▶ hooks (session) ─▶ chat/service.ts
  1. requireUser; load conversation (user-scoped); assert model enabled
  2. ensure workspace; persist incoming user message (parts)
  3. model  = registry.resolveModel(conv.model)
     tools  = buildTools({ user, mode, memoryEnabled, agentAllowlist })
     system = systemPrompt({ memoryEnabled, skillsIndex, persona? })
  4. controller = new AbortController(); streams.register(conv.id, controller)
  5. streamText({ model, system, tools,
       messages: await convertToModelMessages(uiMessages),
       stopWhen: stepCountIs(conv.mode === 'agent' ? maxSteps : 5),
       abortSignal: controller.signal,
       onFinish  → persist assistant message (status 'complete'), generate title if first reply
       onAbort   → persist partial (status 'partial')
       onError   → persist (status 'failed', error text) })
  6. return result.toUIMessageStreamResponse()
```

`/api/chat/[id]/abort` looks up the controller and aborts; client Stop button hits it (§4.5). Regenerate = client drops last assistant message and re-POSTs; server persists over it. Edit = client truncates local messages after the edited one, PATCHes the conversation, re-POSTs (no branching — later messages discarded).

---

## 8. Frontend structure & state (Svelte 5 runes)

### 8.1 Rules

- Runes everywhere: `$state`, `$derived`, `$effect`, `$props`, `$bindable`. No `writable` stores, no `export let`, no `$app/stores` (`$app/state` instead).
- Shared client state lives in `.svelte.ts` modules; component-local state stays in the component.
- Server data via `load` + `invalidate`/`depends`; long-lived reactive objects (the `Chat` class) are fine in components.

### 8.2 Shared state example — `lib/state/sidebar.svelte.ts`

```ts
class SidebarState {
	open = $state(true);
	toggle = () => (this.open = !this.open);
}
export const sidebar = new SidebarState();
```

### 8.3 Chat pages

`routes/(app)/chat/[id]/+page.svelte` — data plumbing only; `{#key}` forces a fresh `ChatView` (and fresh `Chat` instance) when navigating between conversations:

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import type { PageData } from './$types';
	import ChatView from '$lib/components/app/ChatView.svelte';

	let { data }: { data: PageData } = $props();
</script>

{#key page.params.id}
	<ChatView conversation={data.conversation} initialMessages={data.messages} />
{/key}
```

`lib/components/app/ChatView.svelte`:

```svelte
<script lang="ts">
	import { untrack } from 'svelte';
	import { Chat } from '@ai-sdk/svelte';
	import { DefaultChatTransport } from 'ai';
	import { toast } from 'svelte-sonner';
	import type { Conversation, UIMessage } from '$lib/types';
	import MessageTimeline from './MessageTimeline.svelte';
	import { PromptInput } from '$lib/components/ai/prompt-input/index.js';

	let {
		conversation,
		initialMessages
	}: {
		conversation: Conversation;
		initialMessages: UIMessage[];
	} = $props();

	// untrack: intentionally captures initialMessages once; the parent remounts
	// this component per conversation via {#key}, so "initial" is always correct.
	const chat = new Chat({
		messages: untrack(() => initialMessages),
		transport: new DefaultChatTransport({ api: '/api/chat' }),
		onError: (e) => toast.error(e.message)
	});

	let input = $state('');
	const busy = $derived(chat.status === 'submitted' || chat.status === 'streaming');

	function send() {
		const text = input.trim();
		if (!text || busy) return;
		input = '';
		chat.sendMessage({ text }, { body: { conversationId: conversation.id } });
	}
</script>

<MessageTimeline messages={chat.messages} status={chat.status} />
<PromptInput bind:value={input} onsubmit={send} onstop={() => chat.stop()} {busy} />
```

- `+page.ts` loads conversation + messages (server repo via `/api/conversations/[id]`), maps DB rows back to `UIMessage`s (`parts` JSON round-trips 1:1).
- Message parts render per type: `text` → `Markdown`, `reasoning` → collapsible, `tool-*` → `<ToolCallCard>`, `file` → `Image`. Ordering preserved (§4.4).
- Persona/mode/model/memory toggles PATCH the conversation; next turn picks it up server-side.

### 8.4 Pages

- `/agents`: `DataTable` + editor drawer (`Sheet`); run view = `StepList` over the transcript conversation's messages + run meta header.
- `/memory`: three-pane `Resizable` (tree | markdown+frontmatter form | `AuditEntry` history).
- `/skills`: list + editor (markdown textarea + frontmatter form) + import dialog.
- `/research`: start form → live run view with rounds indicator (`StepList` grouped by round) → report markdown + `.md` download.
- `/settings/*`: superforms + zod; providers/models/mcp tables are admin-gated in the layout load.

---

## 9. Cross-cutting

- **System prompt assembly** (`llm/systemPrompt.ts`): base transparency instructions ("call `search_memory` early" when memory on, §8.3) + available-skills index (names + descriptions from scanner, §9.4) + persona/agent prompt + per-conversation override.
- **Errors**: endpoints return `{ error: { code, message } }`; chat errors persist on the message and render as retry card (§4.5). `hooks.server.ts` handles unexpected 500s + request logging.
- **Security checklist (M9)**: CSP via `kit.config` nonces (no inline scripts); SSRF guard on webfetch; path-traversal guards (memory/documents/workspace); argon2id API keys; secrets never serialized to client (`$lib/server` imports enforced by SvelteKit); `update_setting` off by default; rate limit on `/api/agents/:id/run` (token bucket per API key, in-memory).
- **PWA (M9)**: `@vite-pwa/sveltekit`, manifest + maskable icons, SW precaches app shell, runtime-caches `GET /api/conversations*` (NetworkFirst) for offline history browsing.
- **Docker**: `node:22-alpine` multi-stage (deps → `vite build` → slim runtime with `node build`), pinned Node major (better-sqlite3 prebuilds, arm64 included); `skills/defaults` and `migrations/` copied into image; volumes `/data /memory /documents /workspaces`; healthcheck `wget /api/health`.

---

## 10. Testing

| Layer       | Tool                                       | Coverage                                                                                                                                                    |
| ----------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | vitest                                     | repos (in-memory SQLite), crypto round-trip, path guards, frontmatter parsing, tool filtering matrix (mode × toggle × allowlist), bash allow-list rejection |
| AI behavior | vitest + `MockLanguageModelV2` (`ai/test`) | chat pipeline persists parts; abort persists partial; tool loop honors `stopWhen`; extraction agent writes valid OKF                                        |
| API         | vitest (handlers with mocked `locals`)     | auth guards, user scoping (cross-user 404s), admin gates                                                                                                    |
| e2e         | playwright                                 | signup → add provider (mock) → chat round-trip → tool card visible → memory extracted (manual trigger) → visible in `/memory`                               |
| Smoke       | docker build + container boot              | migrations apply, healthcheck 200                                                                                                                           |

`pnpm check` (svelte-check), `pnpm lint`, `pnpm test` gate every milestone.

---

## 11. Decisions (locked)

1. **SSRF**: no guard — webfetch may fetch any URL, including private/LAN addresses. (No `WEBFETCH_ALLOW_PRIVATE` env var.)
2. **Memory tools in chat**: all memory MCP tools (including `delete_concept`) stay registered in chat mode.
3. **Attachments**: 50 MB per file by default via `MAX_ATTACHMENT_SIZE_MB` (env), overridable in Settings UI.
4. **Run resume**: interrupted agent runs are marked `failed` on boot; the run view stays readable. True resume is v2.
5. **Agent caller identity**: background runs act as the agent's owner (scopes `chat-search`, `settings` admin check, workspace).
6. **`tool_results` retention**: no cap in v1; monitor DB growth, revisit with usage data.
