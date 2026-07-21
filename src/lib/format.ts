export function formatCount(n: number): string {
	if (n < 1000) return String(n);
	const format = (value: number, suffix: string) => {
		const rounded = Math.round(value * 10) / 10;
		return `${rounded}${suffix}`;
	};
	if (n < 1_000_000) return format(n / 1000, 'k');
	return format(n / 1_000_000, 'M');
}
