# Plan: Route regular AI requests through proxy compression

## Decisions (from user)

- Scope: main chat (`chat/service.ts`) + autonomous agent runs (`agents/runner.ts`); title generation (`chat/title.ts`) deliberately excluded (caveman would degrade titles; prompts too small for headroom)
- Same toggles: reuse `proxyCaveman` / `proxyHeadroom` user settings for both surfaces (no new keys)
- Log regular requests into `proxy_requests` with `endpoint: 'chat' | 'agent.run'`, `api_key_id: NULL` — unified tokens/cost/savings on `/requests` and settings/api "Your savings"

## What we build on

- `src/lib/server/proxy/handler.ts` already has the full compression pipeline: `prepareCompression` (loads per-user settings, headroom message replacement via `applyHeadroom`, caveman injection via `applyCaveman`/system-message insert) and `finalizeCompression` (compression JSON with estSaved/overhead/basis, EMA baseline recording when caveman off).
- `caveman.ts` / `headroom.ts` export all primitives; `headroom-ai@0.22.4` installed.
- `proxy_requests` columns are all nullable where needed (`api_key_id`, `http_status`, tokens, `cost_usd`, `compression`) — no migration.
- Chat keeps its own system prompt, server tools, multi-step loop (`stopWhen`), and UI-message streaming — only the compression module is shared, NOT the OpenAI HTTP/format layer.

## Phases (each ends with green `vitest --project server` / `check` / `lint`)

1. Extract shared module `src/lib/server/proxy/compression.ts`: move + export `CavemanMode`, `CompressionContext`, `prepareCompression`, `finalizeCompression`; generalize the prepared param to `{instructions?: string; messages: ModelMessage[]}`. `handler.ts` imports from it. Zero behavior change.
2. Chat service: after `buildSystemPrompt` + `convertToModelMessages`, run `prepareCompression(db, userId, {instructions: systemPrompt, messages}, ref.modelId, 'instructions')`; pass mutated system/messages to `streamText`. Log via `createProxyRequest({apiKeyId: null, endpoint: 'chat', ...})` (repo input widened to allow null). In `onEnd`: `await result.totalUsage` → finalize log (tokens, cost via cost helper extracted to `pricing.ts`, `compression: finalizeCompression(...)`); abort with usage still counts `complete`, error → `failed`. Baseline auto-records when caveman off. Tests: caveman marker in system, mocked headroom replacement + log JSON, off → null compression + baseline written.
3. Agent runner: same integration (`endpoint: 'agent.run'`), finalize after the UI-message loop with `result.totalUsage`.
4. Reporting & copy: `/requests` endpoint filter gains `chat`/`agent.run` (verify filterOptions + NULL key rendering); settings/api copy updated from proxy-only to "applies to chat and API requests".

## Risks / notes

- Headroom on messages with inlined base64 image parts may fail → `applyHeadroom` returns null → uncompressed passthrough (add a test).
- `totalUsage` aggregates all steps in multi-step loops — cost/savings reflect the full run.
- Existing chat/agent tests must stay green with settings off (headroom-ai never called).
