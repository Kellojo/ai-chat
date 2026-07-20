import { CronExpressionParser } from 'cron-parser';
import { config } from '../config.js';
import { getDb, type Db } from '../db/index.js';
import {
	claimAgentRun,
	listActiveUserIds,
	listDueScheduleAgents,
	listOverridesForAgent
} from '../db/repo/agents.js';
import { gcAgentWorkspaces } from '../workspaces.js';
import { startAgentRun } from './runner.js';

export function isValidCron(cron: string): boolean {
	try {
		CronExpressionParser.parse(cron);
		return true;
	} catch {
		return false;
	}
}

export function computeNextRunAt(cron: string, from: number = Date.now()): number | null {
	try {
		return CronExpressionParser.parse(cron, { currentDate: new Date(from), tz: config.TZ })
			.next()
			.getTime();
	} catch {
		return null;
	}
}

const inFlight = new Set<string>();
let lastGc = 0;

export async function tickAgents(
	db: Db = getDb(),
	runAgentFn?: (agentId: string, userId: string) => Promise<unknown>
): Promise<number> {
	const run =
		runAgentFn ??
		((agentId: string, userId: string) =>
			startAgentRun({ agentId, trigger: 'schedule', userId }).then((s) => s.done));
	let started = 0;
	const now = Date.now();
	for (const agent of listDueScheduleAgents(db, now)) {
		let cron: string | undefined;
		try {
			cron = (JSON.parse(agent.trigger_config) as { cron?: string }).cron;
		} catch {
			cron = undefined;
		}
		const claimed = claimAgentRun(
			db,
			agent.id,
			agent.next_run_at,
			cron ? computeNextRunAt(cron, now) : null
		);
		if (!claimed || inFlight.has(agent.id)) continue;
		inFlight.add(agent.id);
		started++;
		try {
			if (agent.user_id === null) {
				const overrides = listOverridesForAgent(db, agent.id);
				for (const userId of listActiveUserIds(db, agent.last_run_at ?? 0)) {
					if (overrides.get(userId) === false) continue;
					await run(agent.id, userId);
				}
			} else {
				await run(agent.id, agent.user_id);
			}
		} catch (e) {
			console.error(`Scheduled run of agent ${agent.id} failed`, e);
		} finally {
			inFlight.delete(agent.id);
		}
	}
	if (Date.now() - lastGc > 24 * 60 * 60 * 1000) {
		lastGc = Date.now();
		const removed = gcAgentWorkspaces(config.WORKSPACE_GC_DAYS);
		if (removed > 0) console.log(`Removed ${removed} stale agent workspace(s)`);
	}
	return started;
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startAgentScheduler(db: Db = getDb()): void {
	if (timer) return;
	timer = setInterval(() => {
		tickAgents(db).catch(console.error);
	}, 30_000);
	timer.unref?.();
	void tickAgents(db).catch(console.error);
}
