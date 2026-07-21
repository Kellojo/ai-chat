export function computeCostUsd(
	priceInput: number | null,
	priceOutput: number | null,
	inputTokens: number | undefined | null,
	outputTokens: number | undefined | null
): number | null {
	if (priceInput == null || priceOutput == null || inputTokens == null || outputTokens == null) {
		return null;
	}
	return (inputTokens * priceInput + outputTokens * priceOutput) / 1_000_000;
}
