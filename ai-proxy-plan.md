# Plan: AI Proxy in ai-chat

## Decisions (from user)

- OpenAI-compatible only for now; Claude Code connects via an external shim (native Anthropic `/v1/messages` endpoint is future work)
- Implement `/chat/completions` only (no legacy text `/completions`)
- Pricing: forward what providers expose (e.g. OpenRouter-style `pricing` in `/models` responses), with admin-editable manual fallback per model

## What we build on (already in the codebase)

- API keys: `api_keys` table, `aic_`-prefixed, argon2-hashed, JSON scopes, `resolveApiKeyIdentity()` in `src/lib/server/auth/apiKey.ts` — currently only scope `agents:run`, used by `api/agents/[id]/run`. We add scope `llm:invoke`.
- Model invocation: `resolveModel({providerId, modelId})` → AI SDK `LanguageModel` (`src/lib/server/llm/registry.ts:60`), AI SDK v7 `streamText`/`generateText` with `totalUsage` — no token persistence anywhere yet.
- Providers: `anthropic` or OpenAI-compatible w/ `base_url`, encrypted keys; `fetchProviderModels()` already probes provider `/models` (`registry.ts:113`) — this is where we capture pricing when the provider returns it.
- Patterns to mirror: agent-runs table/repo/pages (running→complete status, admin User column, `formatTimeAgo` + tooltip), settings admin layout (`settings/+layout.svelte`), `user_settings` key-value store for per-user options, `requireAdmin` guard, migrations next free: `0012`.

## Architecture

New server module `src/lib/server/proxy/`:

- `handler.ts` — shared pipeline: auth+scope → resolve model (mapping w/ fallbacks → direct) → per-user compression → `streamText` → format conversion → finalize request log.
- `openaiChat.ts`, `openaiResponses.ts` — request/response converters (OpenAI ⇄ AI SDK `ModelMessage` + JSON-schema tool passthrough).
- `caveman.ts`, `headroom.ts`, `pricing.ts`, `db/repo/proxy-requests.ts`, `db/repo/model-mappings.ts`.

Proxy is a **pure passthrough**: no ai-chat system prompt, memory, or server tools; client `tools`/`tool_choice` pass through (required for coding agents). Request/response **bodies are never logged** — metadata only.

## Endpoints (base `/api/v1`, clients use that as baseURL)

| Endpoint                        | Auth                     | Notes                                                                                                                           |
| ------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/models`            | **public**               | OpenAI `{object:'list'}` shape; enabled models (`id`=`model_id`, `owned_by`=provider) + enabled mappings (`owned_by:'ai-chat'`) |
| `POST /api/v1/chat/completions` | Bearer key, `llm:invoke` | stream (SSE chunks incl. `tool_calls` deltas, `usage` via `stream_options.include_usage`) + non-stream; OpenAI error envelope   |
| `POST /api/v1/responses`        | Bearer key, `llm:invoke` | Responses API subset: `input`/`instructions`/`tools`, SSE `response.*` events; documented subset                                |

Status codes: 401 no/invalid key, 403 missing scope, 404 unknown model, 502 upstream (after fallbacks exhausted).

## Model resolution, mappings, fallback

- Order: `model_mappings` name match → ordered `targets` (JSON `[{providerId, modelId}]`, fallback order) → direct enabled-model `model_id` match → 404.
- Fallback: advance to next target on network error/5xx/429 **before first streamed byte**; record served target + `fallback_index`.
- `model_mappings` table + CRUD API `/api/model-mappings` (admin) + admin page `settings/mappings` (name, ordered target editor w/ provider/model selects, enable toggle).

## Request log (admin)

- `proxy_requests` table: `id, user_id, api_key_id, endpoint, requested_model, mapping_id, provider_id, model_id, fallback_index, status(running|complete|failed), http_status, started_at, latency_ms, input_tokens, output_tokens, cost_usd NULL, stream, error, compression JSON` (`{caveman:{level,estSaved}, headroom:{before,after}}`). Row inserted as `running` at start, finalized on finish/error — mirrors agent-runs.
- `(app)/requests` page, admin-only sidebar entry: stat cards (total requests, success rate, avg latency, tokens in/out, total cost, distinct models, tokens saved per method) honoring the same filters as the table (user, key, model, status, endpoint, date range); paginated table; `/requests/[id]` detail (error, timings, compression breakdown).

## Pricing

- Nullable `price_input`/`price_output` (USD/1M tok) columns on `models`.
- `fetchProviderModels`/`upsertFetchedModels` extended to parse provider-supplied pricing (OpenRouter-style `pricing.prompt/completion`) and store it on refresh.
- Admin-editable fallback fields on `settings/models` for providers that don't expose pricing; cost stays `—` when unknown.

## Per-user: API keys + getting started

- `settings/api` page (all users; verify whether a keys UI already exists under `settings/account`, extend or create): create key (label, scopes, raw key shown once), list/revoke own keys.
- Getting-started cards with copy buttons: **curl** (`POST …/api/v1/chat/completions`), **opencode** (`opencode.json` provider with `baseURL: https://host/api/v1` + `aic_` key), **Claude Code** — documented via an OpenAI-compatible shim (e.g. claude-code-router) for now; native `/v1/messages` noted as future work.

## Compression (per-user, stored in `user_settings`)

- **Caveman** (`off|lite|full|ultra|wenyan`): vendor the skill prompt per level into `caveman.ts` (MIT, attribution), append to system prompt of that user's proxy requests. Savings are **estimates** (their own HONEST-NUMBERS doc: output-only, skill adds ~1–1.5k input tokens) — record actual output tokens + estimated saved (chars→tokens heuristic against a per-user rolling baseline), labeled as estimate, overhead included.
- **Headroom** (bool): `headroom-ai@^0.22` ships a `vercel-ai` adapter (peer `ai>=6`, we have v7 — verify at impl time); wrap the resolved `LanguageModel` when enabled, record exact input tokens before/after compression.
- Reporting: per-request savings column + `compression` JSON; aggregated "tokens saved per method" cards on the admin requests page; per-user own totals on `settings/api`.

## Migrations

- `0012_proxy_models_mappings.sql`: models price columns, `model_mappings`.
- `0013_proxy_requests.sql`: `proxy_requests` (+ indexes on started_at, user_id, api_key_id).

## Phases (each ends with green `vitest --project server` / `check` / `lint`)

1. Migrations + repos (`model-mappings`, `proxy-requests`, pricing parse) + specs; price fields on models settings.
2. Proxy core: public `/api/v1/models`, `/api/v1/chat/completions` (stream+non-stream), `llm:invoke` scope, request logging.
3. Admin requests page + stats.
4. Mappings CRUD UI + fallback chain.
5. `/api/v1/responses` subset.
6. `settings/api`: keys UI + getting-started snippets.
7. Compression: caveman + headroom toggles, savings logging + reporting.

Tests follow existing patterns (`MockLanguageModel` as in `service.spec.ts`, route-call helpers as in `agents.spec.ts`): auth/scope matrix, SSE chunk shape, fallback ordering, logging fields, pricing calc, stats SQL, compression on/off.
