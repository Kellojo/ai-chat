declare global {
	namespace App {
		interface Locals {
			user: import('$lib/server/auth/index.js').AuthSession['user'] | null;
			session: import('$lib/server/auth/index.js').AuthSession['session'] | null;
		}
	}
}

export {};
