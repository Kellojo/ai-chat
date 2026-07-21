import { randomUUID } from 'node:crypto';
import type {
	ImagePart,
	LanguageModelUsage,
	ModelMessage,
	TextPart,
	Tool,
	ToolCallPart,
	ToolChoice,
	ToolResultPart
} from 'ai';
import { z } from 'zod';
import type { ProxyAssembler, ProxyFormats, ProxyStreamFormat, SseEmit } from './handler.js';
import { toSdkToolChoice, toSdkTools } from './openaiChat.js';

const contentPartSchema = z.looseObject({
	type: z.string(),
	text: z.string().optional(),
	image_url: z.string().optional()
});

const messageItemSchema = z.object({
	type: z.literal('message').optional(),
	role: z.enum(['system', 'user', 'assistant']),
	content: z.union([z.string(), z.array(contentPartSchema)])
});

const functionCallItemSchema = z.object({
	type: z.literal('function_call'),
	call_id: z.string(),
	name: z.string(),
	arguments: z.string()
});

const functionCallOutputItemSchema = z.object({
	type: z.literal('function_call_output'),
	call_id: z.string(),
	output: z.string()
});

const inputItemSchema = z.union([
	functionCallItemSchema,
	functionCallOutputItemSchema,
	messageItemSchema
]);

export const responsesRequestSchema = z.object({
	model: z.string().min(1),
	input: z.union([z.string(), z.array(inputItemSchema)]),
	instructions: z.string().optional(),
	tools: z
		.array(
			z.object({
				type: z.literal('function'),
				name: z.string(),
				description: z.string().optional(),
				parameters: z.record(z.string(), z.unknown()).optional(),
				strict: z.boolean().optional()
			})
		)
		.optional(),
	tool_choice: z
		.union([
			z.enum(['auto', 'none', 'required']),
			z.object({ type: z.literal('function'), name: z.string() })
		])
		.optional(),
	temperature: z.number().optional(),
	top_p: z.number().optional(),
	max_output_tokens: z.number().int().positive().optional(),
	stream: z.boolean().optional().default(false)
});

export type ResponsesRequest = z.infer<typeof responsesRequestSchema>;
type ResponsesInputItem = Exclude<ResponsesRequest['input'], string>[number];
type ResponsesMessageItem = Extract<ResponsesInputItem, { role: unknown }>;
type ResponsesContentPart = Exclude<ResponsesMessageItem['content'], string>[number];

function textParts(content: ResponsesContentPart[]): TextPart[] {
	return content
		.filter(
			(part) =>
				(part.type === 'input_text' || part.type === 'output_text') && typeof part.text === 'string'
		)
		.map((part) => ({ type: 'text', text: part.text! }));
}

function joinedText(content: ResponsesMessageItem['content']): string {
	if (typeof content === 'string') return content;
	return textParts(content)
		.map((part) => part.text)
		.join('');
}

function joinInstructions(parts: string[]): string | undefined {
	const text = parts.filter((part) => part.length > 0).join('\n');
	return text.length > 0 ? text : undefined;
}

export function toResponsesPrompt(input: ResponsesRequest): {
	instructions: string | undefined;
	messages: ModelMessage[];
} {
	const systemParts: string[] = [];
	if (input.instructions !== undefined) systemParts.push(input.instructions);
	const messages: ModelMessage[] = [];
	if (typeof input.input === 'string') {
		messages.push({ role: 'user', content: input.input });
		return { instructions: joinInstructions(systemParts), messages };
	}
	const toolNames = new Map<string, string>();
	for (const item of input.input) {
		if (item.type === 'function_call') toolNames.set(item.call_id, item.name);
	}
	for (const item of input.input) {
		if (item.type === 'function_call') {
			let parsed: unknown;
			try {
				parsed = JSON.parse(item.arguments);
			} catch {
				parsed = {};
			}
			const part: ToolCallPart = {
				type: 'tool-call',
				toolCallId: item.call_id,
				toolName: item.name,
				input: parsed ?? {}
			};
			messages.push({ role: 'assistant', content: [part] });
		} else if (item.type === 'function_call_output') {
			const part: ToolResultPart = {
				type: 'tool-result',
				toolCallId: item.call_id,
				toolName: toolNames.get(item.call_id) ?? 'unknown',
				output: { type: 'text', value: item.output }
			};
			messages.push({ role: 'tool', content: [part] });
		} else if (item.role === 'system') {
			systemParts.push(joinedText(item.content));
		} else if (item.role === 'user') {
			if (typeof item.content === 'string') {
				messages.push({ role: 'user', content: item.content });
			} else {
				const parts: (TextPart | ImagePart)[] = [];
				for (const part of item.content) {
					if (
						(part.type === 'input_text' || part.type === 'output_text') &&
						typeof part.text === 'string'
					) {
						parts.push({ type: 'text', text: part.text });
					} else if (part.type === 'input_image' && typeof part.image_url === 'string') {
						parts.push({ type: 'image', image: part.image_url });
					}
				}
				messages.push({ role: 'user', content: parts });
			}
		} else if (typeof item.content === 'string') {
			messages.push({ role: 'assistant', content: item.content });
		} else {
			messages.push({ role: 'assistant', content: textParts(item.content) });
		}
	}
	return { instructions: joinInstructions(systemParts), messages };
}

export function toResponsesSdkTools(
	tools: ResponsesRequest['tools']
): Record<string, Tool> | undefined {
	return toSdkTools(
		tools?.map((t) => ({
			type: 'function' as const,
			function: { name: t.name, description: t.description, parameters: t.parameters }
		}))
	);
}

export function toResponsesSdkToolChoice(
	choice: ResponsesRequest['tool_choice']
): ToolChoice<Record<string, Tool>> | undefined {
	return toSdkToolChoice(
		choice === undefined || typeof choice === 'string'
			? choice
			: { type: 'function', function: { name: choice.name } }
	);
}

interface ResponsesUsage {
	input_tokens: number | null;
	output_tokens: number | null;
	total_tokens: number | null;
}

function toResponsesUsage(usage: LanguageModelUsage | null | undefined): ResponsesUsage {
	return {
		input_tokens: usage?.inputTokens ?? null,
		output_tokens: usage?.outputTokens ?? null,
		total_tokens: usage?.totalTokens ?? null
	};
}

interface CollectedToolCall {
	id: string;
	callId: string;
	name: string;
	arguments: string;
}

function buildOutputItems(messageId: string, text: string, toolCalls: CollectedToolCall[]) {
	return [
		{
			id: messageId,
			type: 'message',
			status: 'completed',
			role: 'assistant',
			content: [{ type: 'output_text', text }]
		},
		...toolCalls.map((call) => ({
			id: call.id,
			type: 'function_call',
			status: 'completed',
			call_id: call.callId,
			name: call.name,
			arguments: call.arguments
		}))
	];
}

export function createResponsesAssembler(model: string): ProxyAssembler {
	const id = `resp_${randomUUID()}`;
	const createdAt = Math.floor(Date.now() / 1000);
	const messageId = `msg_${randomUUID()}`;
	let text = '';
	const toolCalls: CollectedToolCall[] = [];
	const byCallId = new Map<string, CollectedToolCall>();
	let usage: LanguageModelUsage | null = null;
	return {
		add(part) {
			switch (part.type) {
				case 'text-delta':
					text += part.text;
					break;
				case 'tool-input-start': {
					const entry: CollectedToolCall = {
						id: `fc_${randomUUID()}`,
						callId: part.id,
						name: part.toolName,
						arguments: ''
					};
					toolCalls.push(entry);
					byCallId.set(part.id, entry);
					break;
				}
				case 'tool-input-delta': {
					const entry = byCallId.get(part.id);
					if (entry) entry.arguments += part.delta;
					break;
				}
				case 'tool-call': {
					const args = JSON.stringify(part.input);
					const existing = byCallId.get(part.toolCallId);
					if (existing) {
						if (!existing.arguments) existing.arguments = args;
					} else {
						const entry: CollectedToolCall = {
							id: `fc_${randomUUID()}`,
							callId: part.toolCallId,
							name: part.toolName,
							arguments: args
						};
						toolCalls.push(entry);
						byCallId.set(part.toolCallId, entry);
					}
					break;
				}
				case 'finish':
					usage = part.totalUsage;
					break;
			}
		},
		get usage() {
			return usage;
		},
		build() {
			return {
				id,
				object: 'response',
				created_at: createdAt,
				status: 'completed',
				model,
				output: buildOutputItems(messageId, text, toolCalls),
				usage: toResponsesUsage(usage)
			};
		}
	};
}

export function createResponsesStreamFormat(model: string): ProxyStreamFormat {
	const id = `resp_${randomUUID()}`;
	const createdAt = Math.floor(Date.now() / 1000);
	const messageId = `msg_${randomUUID()}`;
	let text = '';
	let messageAdded = false;
	const toolCalls: (CollectedToolCall & { outputIndex: number })[] = [];
	const byCallId = new Map<string, (typeof toolCalls)[number]>();
	const shell = (status: 'in_progress' | 'completed' | 'failed') => ({
		id,
		object: 'response' as const,
		created_at: createdAt,
		status,
		model
	});
	const addToolCall = (callId: string, name: string, emit: SseEmit) => {
		const entry = {
			id: `fc_${randomUUID()}`,
			callId,
			name,
			arguments: '',
			outputIndex: toolCalls.length + 1
		};
		toolCalls.push(entry);
		byCallId.set(callId, entry);
		emit('response.output_item.added', {
			type: 'response.output_item.added',
			output_index: entry.outputIndex,
			item: {
				id: entry.id,
				type: 'function_call',
				status: 'in_progress',
				call_id: callId,
				name,
				arguments: ''
			}
		});
		return entry;
	};
	return {
		start(emit) {
			emit('response.created', { type: 'response.created', response: shell('in_progress') });
		},
		part(part, emit) {
			switch (part.type) {
				case 'text-delta': {
					if (!messageAdded) {
						messageAdded = true;
						emit('response.output_item.added', {
							type: 'response.output_item.added',
							output_index: 0,
							item: {
								id: messageId,
								type: 'message',
								status: 'in_progress',
								role: 'assistant',
								content: []
							}
						});
					}
					text += part.text;
					emit('response.output_text.delta', {
						type: 'response.output_text.delta',
						item_id: messageId,
						output_index: 0,
						content_index: 0,
						delta: part.text
					});
					break;
				}
				case 'tool-input-start':
					addToolCall(part.id, part.toolName, emit);
					break;
				case 'tool-input-delta': {
					const entry = byCallId.get(part.id);
					if (!entry) break;
					entry.arguments += part.delta;
					emit('response.function_call_arguments.delta', {
						type: 'response.function_call_arguments.delta',
						item_id: entry.id,
						output_index: entry.outputIndex,
						delta: part.delta
					});
					break;
				}
				case 'tool-call': {
					const entry =
						byCallId.get(part.toolCallId) ?? addToolCall(part.toolCallId, part.toolName, emit);
					if (!entry.arguments) {
						const args = JSON.stringify(part.input ?? {});
						entry.arguments = args;
						emit('response.function_call_arguments.delta', {
							type: 'response.function_call_arguments.delta',
							item_id: entry.id,
							output_index: entry.outputIndex,
							delta: args
						});
					}
					break;
				}
			}
		},
		finish(usage, emit) {
			emit('response.completed', {
				type: 'response.completed',
				response: {
					...shell('completed'),
					output: buildOutputItems(messageId, text, toolCalls),
					usage: toResponsesUsage(usage)
				}
			});
		},
		fail(message, emit) {
			emit('response.failed', {
				type: 'response.failed',
				response: { ...shell('failed'), error: { code: 'server_error', message } }
			});
		},
		done() {
			return null;
		}
	};
}

export function responsesFormats(model: string): ProxyFormats {
	return {
		assembler: () => createResponsesAssembler(model),
		stream: () => createResponsesStreamFormat(model)
	};
}
