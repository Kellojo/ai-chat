import type { BetterAuthOptions } from 'better-auth';
import { genericOAuth } from 'better-auth/plugins';
import { config } from '../config.js';
import { getAppSecret } from '../crypto.js';
import { getDb } from '../db/index.js';

const oidc =
	config.OIDC_ISSUER && config.OIDC_CLIENT_ID && config.OIDC_CLIENT_SECRET
		? {
				providerId: 'oidc',
				discoveryUrl: `${config.OIDC_ISSUER.replace(/\/$/, '')}/.well-known/openid-configuration`,
				clientId: config.OIDC_CLIENT_ID,
				clientSecret: config.OIDC_CLIENT_SECRET,
				scopes: config.OIDC_SCOPES.split(' ')
			}
		: null;

export function authOptions(): BetterAuthOptions {
	return {
		appName: 'Chatty',
		...(config.ORIGIN ? { baseURL: config.ORIGIN } : {}),
		secret: getAppSecret(),
		database: getDb(),
		emailAndPassword: {
			enabled: config.ENABLE_PASSWORD_LOGIN && !config.OIDC_ONLY,
			disableSignUp: !config.ENABLE_SIGNUP || config.OIDC_ONLY
		},
		user: {
			additionalFields: {
				role: { type: 'string', defaultValue: 'user', input: false }
			}
		},
		databaseHooks: {
			user: {
				create: {
					before: async (user) => {
						if (config.AUTO_PROMOTE_FIRST_USER) {
							const { c } = getDb().prepare('SELECT COUNT(*) AS c FROM user').get() as {
								c: number;
							};
							if (c === 0) return { data: { ...user, role: 'admin' } };
						}
						return { data: user };
					}
				}
			}
		},
		account: {
			accountLinking: {
				enabled: true,
				trustedProviders: ['oidc']
			}
		},
		plugins: [...(oidc ? [genericOAuth({ config: [oidc] })] : [])]
	};
}
