class PendingMessage {
	text = $state('');
	files = $state<File[]>([]);
	set(text: string, files: File[] = []) {
		this.text = text;
		this.files = files;
	}
	consume(): { text: string; files: File[] } | null {
		if (!this.text && this.files.length === 0) return null;
		const pending = { text: this.text, files: this.files };
		this.text = '';
		this.files = [];
		return pending;
	}
}

export const pendingMessage = new PendingMessage();
