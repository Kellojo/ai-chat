# Improvements Round 2

SvelteKit 2 + Svelte 5 (runes mode), TypeScript strict, pnpm. Conventions:

- Svelte 5 runes only (`$state`, `$derived`, `$effect`, `$props`). No comments in code.
- Use `resolve()` from `$app/paths` for links/goto (eslint enforces this).
- Verify with: `pnpm check`, `pnpm lint`, `pnpm vitest run --project server`. All must pass (2 pre-existing `state_referenced_locally` warnings in `settings/account/+page.svelte` are acceptable).
- Do not restyle vendored components in `src/lib/components/ui/**` or `src/lib/components/ai/**` (lint-exempt).

## 1. Conversation list: sort by last activity, live

**Current state (verified):** `listConversations` in `src/lib/server/db/repo/conversations.ts:59` already orders `pinned DESC, updated_at DESC`, and `Sidebar.svelte` (`groupByDate`) buckets into Pinned/Today/Yesterday/7 days/Older preserving that order. Two real problems remain:

a) **Stale while chatting.** Sending messages bumps `updated_at` server-side (`touchConversation` in `src/lib/server/chat/service.ts`), but the sidebar's data comes from the `(app)` layout load, which is not re-fetched after a stream finishes — so the conversation doesn't move to the top and the auto-generated title doesn't show until an unrelated navigation/refresh.

- Fix: in `src/lib/components/app/ChatView.svelte`, add an `$effect` that watches `chat.status` and calls `invalidateAll()` (from `$app/navigation`) once when it transitions from `'streaming'`/`'submitted'` back to `'ready'` (track the previous status in a `let`, only fire on the edge transition, never in a loop). This refreshes ordering and the generated title in the sidebar.

b) **Non-message edits reorder the list.** `updateConversation` (`conversations.ts:119`) sets `updated_at = Date.now()` on every patch (rename, model change, settings toggles), so e.g. renaming an old chat jumps it to the top.

- Fix: remove the `updated_at` bump from `updateConversation` (keep it in `touchConversation` and `setConversationTitle`). Check `updateConversation`'s callers/tests (`conversations.spec.ts`) and adjust expectations.

**Acceptance:** send a message in an older conversation → it moves to the top of the sidebar immediately after the response finishes; renaming a conversation does not reorder it; pinned conversations still pin to the top.

## 2. Reasoning fold-out: readable list markers

In `src/lib/components/app/MessageTimeline.svelte` the expanded reasoning content renders via `<Markdown>` inside a bordered panel; `ul`/`ol` markers are hard to read against the background/border line.

- Fix: give the reasoning content container a dedicated class (e.g. `reasoning-body`) and add scoped CSS in the component's existing `<style>` block. Because Markdown output is rendered HTML, selectors need `:global(...)`, e.g. `:global(.reasoning-body li)`. Replace native markers with custom bullets that have a colored backdrop:

```css
:global(.reasoning-body ul),
:global(.reasoning-body ol) {
	list-style: none;
	padding-left: 1rem;
}
:global(.reasoning-body li) {
	position: relative;
}
:global(.reasoning-body li)::before {
	content: '';
	position: absolute;
	left: -0.9rem;
	top: 0.55em;
	width: 0.45rem;
	height: 0.45rem;
	border-radius: 9999px;
	background: var(--muted-foreground);
	opacity: 0.7;
}
```

- Use theme CSS variables (inspect `src/routes/layout.css` for available tokens like `--muted-foreground`, `--accent`) so it works in light and dark mode. For ordered lists, use a counter with a small filled circle behind the number instead (`counter-increment`, `::before` with `content: counter(...)` and a background circle). Tune sizes so numbers/markers stay legible.

**Acceptance:** expand reasoning containing bullet and numbered lists → markers sit on/inside a small colored dot/circle, readable in both light and dark mode.

## 3. New chat: prefill the configured default chat model

**Current state:** `src/routes/(app)/+page.server.ts` returns `defaultModel` from `findRoleModel(db, 'chat')`, and `src/routes/(app)/+page.svelte` computes `selectedValue = picked || defaultModelValue` and passes it to `ModelPicker`. This should already prefill — investigate why it doesn't in practice:

- Check `ModelPicker.svelte`: `Select.Root type="single" {value}` receives value as a plain prop. Verify in the browser that the trigger shows the default model's label on first render. If bits-ui only applies `value` on interaction, switch to `bind:value` with a local `$state` initialized from the prop (use `untrack` from `svelte` if you hit `state_referenced_locally` warnings — do not use svelte-ignore comments, eslint flags them as unused).
- Check the case where the default model exists but `listModelsGrouped()` doesn't include it (e.g. disabled model — inspect `listModelsGrouped` in `src/lib/server/llm/registry.ts` to see whether it filters `enabled`). If the default can be missing from `groups`, decide: either always include role-default models in the grouped list, or fall back gracefully.
- Also prefill in `ChatTopbar.svelte`: when a conversation has no model yet (`conversation.providerId == null`), show the chat role default as the picker's value instead of the placeholder. The needed data is not currently passed to the chat page — extend `src/routes/(app)/chat/[id]/+page.server.ts` to also return `defaultModel` (same code as the home `+page.server.ts`) and thread it through `chat/[id]/+page.svelte` → `ChatView.svelte` → `ChatTopbar.svelte` as an optional prop. Display-only: do not PATCH the conversation; the server already assigns the role default on first message (`ensureModel` in `src/lib/server/chat/service.ts`).

**Acceptance:** with a default chat model set in `/settings/defaults`, the home page picker shows it without any clicks, and picking a different model still works; with no default configured, the placeholder and the "Select a model to start chatting." hint appear.

## 4. Sidebar open/close: no layout jumps

**Current state:** `src/routes/(app)/+layout.svelte` mounts/unmounts the sidebar via `{#if sidebarOpen}`; `Sidebar.svelte` has `transition:fly|local={{ x: -300, duration: 200 }}` on its `<aside>`; `<main>` toggles `pl-12` instantly when closed. Two jump sources: the fly transition keeps the aside in the flex layout at full width until the outro completes (main snaps wider at the end, and intro shows a gap), and the padding change is instant.

- Fix by animating width instead of translating the sidebar:
  - In `src/routes/(app)/+layout.svelte`, keep `<Sidebar>` always mounted inside a wrapper div:
    ```svelte
    <div
    	class="h-full shrink-0 overflow-hidden transition-[width] duration-200"
    	style:width={sidebarOpen ? '288px' : '0px'}
    >
    	<Sidebar ... />
    </div>
    ```
    (Sidebar's `<aside>` is `w-72` = 288px; fixed inner width + `overflow-hidden` clips content instead of squishing it.)
  - Remove the `transition:fly|local` (and the now-unused `fly` import) from `Sidebar.svelte`.
  - Smooth the main padding too: on `<main>` add `transition-[padding] duration-200` so the `pl-12` toggle animates in sync (same duration as the width transition).
- Bonus: since the sidebar now stays mounted, its local state (search query, scroll position) survives close/open — keep it that way; do not add `{#key}` or remounts.
- Check both directions at different window sizes and on the home page and a chat page: no content jumps, the floating open button (top-left) stays put, and the chat input/timeline resize smoothly.

**Acceptance:** opening and closing the sidebar animates main content smoothly in both directions with zero snapping; no overlap of the floating button and the model picker at any point during the animation.

## 5. Provisional title from the first user message

**Current state:** conversations are created with `title = ''`; the LLM title is generated after the first response completes (`generateConversationTitle` in `src/lib/server/chat/title.ts`, triggered from `service.ts`'s `onEnd` when `conversation.title === ''`). Until then the sidebar shows "New chat".

- Fix: in `src/lib/server/chat/service.ts`, after `syncMessages(...)` succeeds and when the conversation's title is still empty, set a provisional title synchronously from the first user message: `extractText(lastUserMessage.parts)` → collapse whitespace → trim → cut at ~50 chars on a word boundary → append `…` if truncated. Persist via `setConversationTitle(db, conversation.id, provisional)` (exported from `conversations.ts`).
- Important ordering detail: `onEnd` checks the captured in-memory `conversation.title === ''` before calling `generateConversationTitle`, and that object is stale (provisional title was set after it was captured) — verify the LLM title still generates and overwrites the provisional one. If you refactor the check, preserve this behavior some other way (e.g. re-read and only skip when a non-provisional title exists). Do not let the provisional title suppress LLM title generation.
- Also make sure `syncMessages`' edit/regenerate path doesn't overwrite an existing title (only set the provisional title when `conversation.title === ''`).
- Add/extend tests in `src/lib/server/chat/service.spec.ts` (uses a mocked registry + `MockLanguageModelV3`, see existing tests): after the first exchange, the conversation title is no longer empty and, because the mock model backs title generation too (or fails gracefully), assert at minimum the provisional-title behavior directly (e.g. a long first prompt → title starts with the prompt's first words and ends with `…`).

**Acceptance:** right after sending the first message the sidebar shows a prompt-derived title instead of "New chat"; when LLM title generation succeeds it replaces the provisional title; when it fails the provisional title remains.
