import { beforeEach, describe, expect, it } from 'vitest';

process.env.DATABASE_PATH = ':memory:';
process.env.APP_SECRET = 'test-secret-test-secret';

const { openDatabase } = await import('../db/index.js');
const { setUserSetting } = await import('../db/repo/user-settings.js');
const {
	applyCaveman,
	cavemanOverheadTokens,
	CAVEMAN_LEVELS,
	CAVEMAN_PROMPTS,
	estimateCavemanSaved,
	getCavemanBaseline,
	parseCavemanLevel,
	recordCavemanBaseline
} = await import('./caveman.js');

const INTENSITY_LINES = {
	lite: 'Intensity: lite.',
	full: 'Intensity: full.',
	ultra: 'Intensity: ultra.',
	wenyan: 'Intensity: wenyan (文言文).'
} as const;

describe('parseCavemanLevel', () => {
	it('passes valid levels through', () => {
		for (const level of CAVEMAN_LEVELS) {
			expect(parseCavemanLevel(level)).toBe(level);
		}
	});

	it('falls back to off for invalid values', () => {
		expect(parseCavemanLevel(undefined)).toBe('off');
		expect(parseCavemanLevel(null)).toBe('off');
		expect(parseCavemanLevel('garbage')).toBe('off');
		expect(parseCavemanLevel(5)).toBe('off');
		expect(parseCavemanLevel(true)).toBe('off');
	});
});

describe('applyCaveman', () => {
	it('passes instructions through unchanged when off', () => {
		expect(applyCaveman('Be nice', 'off')).toBe('Be nice');
		expect(applyCaveman(undefined, 'off')).toBeUndefined();
	});

	it('includes the shared base and intensity line for each level', () => {
		for (const level of ['lite', 'full', 'ultra', 'wenyan'] as const) {
			const result = applyCaveman(undefined, level)!;
			expect(result).toContain('smart caveman');
			expect(result).toContain(INTENSITY_LINES[level]);
		}
	});

	it('appends the level prompt after existing instructions', () => {
		const result = applyCaveman('Be nice', 'lite')!;
		expect(result.startsWith('Be nice\n\n')).toBe(true);
		expect(result).toContain('smart caveman');
		expect(result).toBe(`Be nice\n\n${CAVEMAN_PROMPTS.lite}`);
	});
});

describe('cavemanOverheadTokens', () => {
	it('is zero when off', () => {
		expect(cavemanOverheadTokens('off')).toBe(0);
	});

	it('estimates ceil(length / 4) per level', () => {
		for (const level of ['lite', 'full', 'ultra', 'wenyan'] as const) {
			expect(cavemanOverheadTokens(level)).toBe(Math.ceil(CAVEMAN_PROMPTS[level].length / 4));
		}
	});
});

describe('estimateCavemanSaved', () => {
	it('uses the per-level ratio without a baseline', () => {
		expect(estimateCavemanSaved('lite', 100, null)).toEqual({
			estSaved: Math.round((100 * 0.3) / 0.7),
			basis: 'ratio'
		});
		expect(estimateCavemanSaved('full', 100, null)).toEqual({
			estSaved: Math.round((100 * 0.65) / 0.35),
			basis: 'ratio'
		});
		expect(estimateCavemanSaved('ultra', 100, null)).toEqual({ estSaved: 300, basis: 'ratio' });
		expect(estimateCavemanSaved('wenyan', 100, null)).toEqual({
			estSaved: Math.round((100 * 0.85) / 0.15),
			basis: 'ratio'
		});
	});

	it('ignores a baseline with fewer than 5 samples', () => {
		expect(estimateCavemanSaved('full', 100, { avg: 500, samples: 4 })).toEqual({
			estSaved: Math.round((100 * 0.65) / 0.35),
			basis: 'ratio'
		});
	});

	it('uses the baseline once it has 5 samples', () => {
		expect(estimateCavemanSaved('full', 50, { avg: 200, samples: 5 })).toEqual({
			estSaved: 150,
			basis: 'baseline'
		});
	});

	it('never reports negative savings', () => {
		expect(estimateCavemanSaved('full', 300, { avg: 200, samples: 10 })).toEqual({
			estSaved: 0,
			basis: 'baseline'
		});
	});
});

describe('caveman baseline', () => {
	let db: ReturnType<typeof openDatabase>;

	beforeEach(() => {
		db = openDatabase(':memory:');
		db.prepare(
			`INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt", role) VALUES ('u1','a@b.c','A',0,0,0,'user')`
		).run();
	});

	it('returns null when nothing is stored', () => {
		expect(getCavemanBaseline(db, 'u1')).toBeNull();
	});

	it('returns null for malformed stored values', () => {
		setUserSetting(db, 'u1', 'cavemanBaseline', 'garbage');
		expect(getCavemanBaseline(db, 'u1')).toBeNull();
	});

	it('tracks a rolling average', () => {
		recordCavemanBaseline(db, 'u1', 100);
		expect(getCavemanBaseline(db, 'u1')).toEqual({ avg: 100, samples: 1 });
		recordCavemanBaseline(db, 'u1', 200);
		expect(getCavemanBaseline(db, 'u1')).toEqual({ avg: 150, samples: 2 });
	});

	it('caps the EMA weight at 50 samples', () => {
		setUserSetting(db, 'u1', 'cavemanBaseline', { avg: 100, samples: 60 });
		recordCavemanBaseline(db, 'u1', 200);
		const baseline = getCavemanBaseline(db, 'u1')!;
		expect(baseline.samples).toBe(61);
		expect(baseline.avg).toBeCloseTo((100 * 50 + 200) / 51);
	});
});
