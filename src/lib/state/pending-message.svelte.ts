class PendingMessage {
	text = $state('');
	set(text: string) {
		this.text = text;
	}
	consume(): string {
		const text = this.text;
		this.text = '';
		return text;
	}
}

export const pendingMessage = new PendingMessage();
