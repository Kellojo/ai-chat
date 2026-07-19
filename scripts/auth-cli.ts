import { betterAuth } from 'better-auth';
import { authOptions } from '../src/lib/server/auth/options.js';

export const auth = betterAuth(authOptions());
