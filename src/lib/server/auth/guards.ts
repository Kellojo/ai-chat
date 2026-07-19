import { error } from '@sveltejs/kit';

export function requireUser(locals: App.Locals) {
	if (!locals.user) error(401, { message: 'Authentication required' });
	return locals.user;
}

export function requireAdmin(locals: App.Locals) {
	const user = requireUser(locals);
	if ((user as { role?: string }).role !== 'admin') error(403, { message: 'Admin required' });
	return user;
}
