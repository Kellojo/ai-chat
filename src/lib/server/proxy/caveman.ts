// Vendored from caveman (https://github.com/juliusbrussee/caveman) — MIT License
// Copyright (c) 2026 Julius Brussee
// Adapted from skills/caveman/SKILL.md (commit 0d95a81).
import type { Db } from '../db/index.js';
import { getUserSetting, setUserSetting } from '../db/repo/user-settings.js';

export const CAVEMAN_LEVELS = ['off', 'lite', 'full', 'ultra', 'wenyan'] as const;
export type CavemanLevel = (typeof CAVEMAN_LEVELS)[number];

export function parseCavemanLevel(value: unknown): CavemanLevel {
	if (typeof value !== 'string') return 'off';
	return (CAVEMAN_LEVELS as readonly string[]).includes(value) ? (value as CavemanLevel) : 'off';
}

const SHARED_PROMPT = `Respond terse like smart caveman. All technical substance stay. Only fluff die.

ACTIVE EVERY RESPONSE. No revert after many turns. No filler drift.

Drop filler (just/really/basically/actually/simply), pleasantries (sure/certainly/of course/happy to), hedging. Technical terms exact. Code blocks unchanged. Errors quoted exact. Standard well-known tech acronyms OK (DB/API/HTTP); never invent new abbreviations. No causal arrows (→).

Preserve user's dominant language. Compress the style, not the language. ALWAYS keep technical terms, code, API names, CLI commands, and exact error strings verbatim.

No self-reference. Never name or announce the style.

Pattern: [thing] [action] [reason]. [next step].

Auto-clarity: drop this style for security warnings, irreversible action confirmations, multi-step sequences where fragment order or omitted conjunctions risk misread, or when compression itself creates technical ambiguity. Resume after the clear part is done.

Code/commits/PRs: write normal.`;

export const CAVEMAN_PROMPTS: Record<Exclude<CavemanLevel, 'off'>, string> = {
	lite: `${SHARED_PROMPT}\n\nIntensity: lite. Keep articles and full sentences. Professional but tight — no filler, no hedging.`,
	full: `${SHARED_PROMPT}\n\nIntensity: full. Drop articles (a/an/the). Fragments OK. Short synonyms (big not extensive, fix not "implement a solution for"). No tool-call narration, no decorative tables/emoji, no dumping long raw error logs unless asked — quote shortest decisive line.`,
	ultra: `${SHARED_PROMPT}\n\nIntensity: ultra. Drop articles. Fragments OK. Strip conjunctions when cause-then-effect stay unambiguous. One word when one word enough. State each fact once. Code symbols, function names, API names, error strings: never touch.`,
	wenyan: `${SHARED_PROMPT}\n\nIntensity: wenyan (文言文). Maximum classical Chinese terseness. 80-90% character reduction. Classical sentence patterns, verbs precede objects, subjects often omitted, classical particles (之/乃/為/其). Technical terms, code, API names stay verbatim.`
};

export function applyCaveman(
	instructions: string | undefined,
	level: CavemanLevel
): string | undefined {
	if (level === 'off') return instructions;
	const prompt = CAVEMAN_PROMPTS[level];
	return instructions ? `${instructions}\n\n${prompt}` : prompt;
}

const CHARS_PER_TOKEN = 4;

export function cavemanOverheadTokens(level: CavemanLevel): number {
	if (level === 'off') return 0;
	return Math.ceil(CAVEMAN_PROMPTS[level].length / CHARS_PER_TOKEN);
}

export interface CavemanBaseline {
	avg: number;
	samples: number;
}

const SAVINGS_RATIOS: Record<Exclude<CavemanLevel, 'off'>, number> = {
	lite: 0.3,
	full: 0.65,
	ultra: 0.75,
	wenyan: 0.85
};

export function estimateCavemanSaved(
	level: CavemanLevel,
	actualOutputTokens: number,
	baseline: CavemanBaseline | null
): { estSaved: number; basis: 'baseline' | 'ratio' } {
	if (baseline && baseline.samples >= 5) {
		return {
			estSaved: Math.max(0, Math.round(baseline.avg - actualOutputTokens)),
			basis: 'baseline'
		};
	}
	if (level === 'off') return { estSaved: 0, basis: 'ratio' };
	const ratio = SAVINGS_RATIOS[level];
	return { estSaved: Math.round((actualOutputTokens * ratio) / (1 - ratio)), basis: 'ratio' };
}

const BASELINE_KEY = 'cavemanBaseline';
const BASELINE_MAX_WEIGHT = 50;

export function getCavemanBaseline(db: Db, userId: string): CavemanBaseline | null {
	const value = getUserSetting<CavemanBaseline>(db, userId, BASELINE_KEY);
	if (
		!value ||
		typeof value !== 'object' ||
		typeof value.avg !== 'number' ||
		typeof value.samples !== 'number'
	) {
		return null;
	}
	return { avg: value.avg, samples: value.samples };
}

export function recordCavemanBaseline(db: Db, userId: string, outputTokens: number): void {
	const current = getCavemanBaseline(db, userId) ?? { avg: 0, samples: 0 };
	const w = Math.min(current.samples, BASELINE_MAX_WEIGHT);
	const avg = (current.avg * w + outputTokens) / (w + 1);
	setUserSetting(db, userId, BASELINE_KEY, { avg, samples: current.samples + 1 });
}
