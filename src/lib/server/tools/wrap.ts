import type { Tool } from 'ai';

type JsonSchema = Record<string, unknown>;

function sanitizeSchema(node: unknown): unknown {
	if (Array.isArray(node)) return node.map(sanitizeSchema);
	if (!node || typeof node !== 'object') return node;
	const input = node as JsonSchema;
	const out: JsonSchema = {};
	for (const [key, value] of Object.entries(input)) {
		if (key === '$schema' || key === 'additionalProperties') continue;
		if (key === 'anyOf' && Array.isArray(value)) {
			const branches = value.filter(
				(branch) => !(branch && typeof branch === 'object' && (branch as JsonSchema).type === 'null')
			);
			if (branches.length === 1) {
				const merged = sanitizeSchema(branches[0]);
				if (merged && typeof merged === 'object') Object.assign(out, merged);
				continue;
			}
			out.anyOf = branches.map(sanitizeSchema);
			continue;
		}
		out[key] = sanitizeSchema(value);
	}
	return out;
}

function sanitizeInputSchema(schema: Tool['inputSchema']): Tool['inputSchema'] {
	if (!schema || typeof schema !== 'object') return schema;
	const wrapper = schema as unknown as { jsonSchema?: unknown };
	if (!wrapper.jsonSchema || typeof wrapper.jsonSchema !== 'object') return schema;
	return {
		...schema,
		jsonSchema: sanitizeSchema(wrapper.jsonSchema)
	} as Tool['inputSchema'];
}

export function wrapMcpTools(set: Record<string, Tool>, serverName: string): Record<string, Tool> {
	const wrapped: Record<string, Tool> = {};
	for (const [name, tool] of Object.entries(set)) {
		const inputSchema = sanitizeInputSchema(tool.inputSchema);
		const execute = tool.execute;
		if (!execute) {
			wrapped[name] = { ...tool, inputSchema };
			continue;
		}
		wrapped[name] = {
			...tool,
			inputSchema,
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
