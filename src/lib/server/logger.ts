type LogLevel = 'info' | 'warn' | 'error';

function write(level: LogLevel, module: string, message: string, data?: Record<string, unknown>) {
	const ts = new Date().toISOString();
	const line = data
		? `[${ts}] [${level}] [${module}] ${message} ${JSON.stringify(data)}`
		: `[${ts}] [${level}] [${module}] ${message}`;
	console[level](line);
}

export interface Logger {
	info(message: string, data?: Record<string, unknown>): void;
	warn(message: string, data?: Record<string, unknown>): void;
	error(message: string, data?: Record<string, unknown>): void;
}

export function createLogger(module: string): Logger {
	return {
		info: (msg, data) => write('info', module, msg, data),
		warn: (msg, data) => write('warn', module, msg, data),
		error: (msg, data) => write('error', module, msg, data)
	};
}
