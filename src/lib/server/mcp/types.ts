export interface CallerContext {
	userId: string;
	role: string;
	workspaceDir: string | null;
	documentsDir: string;
	author?: string;
	conversationId?: string | null;
	agentRunId?: string | null;
}
