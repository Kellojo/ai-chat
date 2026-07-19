export const THEMES = ['light', 'dark', 'system'] as const;

export type Theme = (typeof THEMES)[number];

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
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
	theme: 'system',
	suggestions: DEFAULT_SUGGESTIONS,
	globalInstructions: ''
};
