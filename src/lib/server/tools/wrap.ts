import type { Tool } from 'ai';

export function wrapMcpTools(set: Record<string, Tool>, serverName: string): Record<string, Tool> {
	const wrapped: Record<string, Tool> = {};
	for (const [name, tool] of Object.entries(set)) {
		const execute = tool.execute;
		if (!execute) {
			wrapped[name] = tool;
			continue;
		}
		wrapped[name] = {
			...tool,
			execute: async (input: unknown, options: Parameters<NonNullable<Tool['execute']>>[1]) => {
				try {
					return await execute(input as never, options as never);
				} catch (e) {
					const message = e instanceof Error ? e.message : String(e);
					throw new Error(`[${serverName}/${name}] ${message}`, { cause: e });
				}
			}
		};
	}
	return wrapped;
}
