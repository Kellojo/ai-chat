export interface ToolMeta {
	label: string;
	server: string;
}

export const TOOL_META: Record<string, ToolMeta> = {
	fetch: { label: 'Fetch URL', server: 'webfetch' },
	now: { label: 'Current time', server: 'datetime' },
	get_timezone: { label: 'Get timezone', server: 'datetime' },
	format: { label: 'Format date', server: 'datetime' },
	convert: { label: 'Convert timezone', server: 'datetime' },
	search_chats: { label: 'Search chats', server: 'chat-search' },
	create_document: { label: 'Create document', server: 'documents' },
	read_document: { label: 'Read document', server: 'documents' },
	update_document: { label: 'Update document', server: 'documents' },
	delete_document: { label: 'Delete document', server: 'documents' },
	list_documents: { label: 'List documents', server: 'documents' },
	search_documents: { label: 'Search documents', server: 'documents' },
	ls: { label: 'List files', server: 'bash' },
	cat: { label: 'Read file', server: 'bash' },
	head: { label: 'Read file start', server: 'bash' },
	tail: { label: 'Read file end', server: 'bash' },
	wc: { label: 'Count words', server: 'bash' },
	grep: { label: 'Search in files', server: 'bash' },
	glob: { label: 'Find files', server: 'bash' },
	get_setting: { label: 'Get setting', server: 'settings' },
	list_settings: { label: 'List settings', server: 'settings' },
	update_setting: { label: 'Update setting', server: 'settings' }
};
