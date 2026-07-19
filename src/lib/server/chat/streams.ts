const controllers = new Map<string, AbortController>();

export function registerStream(conversationId: string, controller: AbortController): void {
	controllers.get(conversationId)?.abort();
	controllers.set(conversationId, controller);
}

export function abortStream(conversationId: string): boolean {
	const controller = controllers.get(conversationId);
	if (!controller) return false;
	controller.abort();
	return true;
}

export function releaseStream(conversationId: string, controller: AbortController): void {
	if (controllers.get(conversationId) === controller) {
		controllers.delete(conversationId);
	}
}
