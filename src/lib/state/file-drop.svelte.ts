export function createFileDrop(onFiles: (files: File[]) => void) {
	let dragActive = $state(false);
	let dragDepth = 0;

	function hasFiles(e: DragEvent): boolean {
		return e.dataTransfer?.types.includes('Files') ?? false;
	}

	function ondragenter(e: DragEvent) {
		if (!hasFiles(e)) return;
		e.preventDefault();
		dragDepth++;
		dragActive = true;
	}

	function ondragover(e: DragEvent) {
		if (!hasFiles(e)) return;
		e.preventDefault();
	}

	function ondragleave(e: DragEvent) {
		if (!hasFiles(e)) return;
		dragDepth--;
		if (dragDepth <= 0) {
			dragDepth = 0;
			dragActive = false;
		}
	}

	function ondrop(e: DragEvent) {
		if (!hasFiles(e)) return;
		e.preventDefault();
		dragDepth = 0;
		dragActive = false;
		onFiles(Array.from(e.dataTransfer?.files ?? []));
	}

	return {
		get dragActive() {
			return dragActive;
		},
		ondragenter,
		ondragover,
		ondragleave,
		ondrop
	};
}
