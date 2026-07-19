import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const isAdmin = (locals.user as { role?: string } | null)?.role === 'admin';
	redirect(302, isAdmin ? '/settings/providers' : '/settings/account');
};
