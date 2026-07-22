export const THEMES = ['light', 'dark', 'system'] as const;

export type Theme = (typeof THEMES)[number];

export const TIME_FORMATS = ['auto', '12h', '24h'] as const;

export type TimeFormat = (typeof TIME_FORMATS)[number];

export const DEFAULT_SUGGESTIONS = [
	'Explain a concept I keep forgetting',
	'Draft an email to my team',
	'Help me plan my week',
	'Brainstorm names for a project'
];

export const MAX_SUGGESTIONS = 8;

export const MAX_GLOBAL_INSTRUCTIONS_LENGTH = 2000;

export interface UserSettings {
	theme: Theme;
	suggestions: string[];
	globalInstructions: string;
	timeFormat: TimeFormat;
	sidebarOpen: boolean;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
	theme: 'system',
	suggestions: DEFAULT_SUGGESTIONS,
	globalInstructions: '',
	timeFormat: 'auto',
	sidebarOpen: true
};
