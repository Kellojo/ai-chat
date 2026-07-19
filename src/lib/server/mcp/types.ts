export interface CallerContext {
	userId: string;
	role: string;
	workspaceDir: string | null;
	documentsDir: string;
}
