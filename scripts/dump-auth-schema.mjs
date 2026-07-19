import Database from 'better-sqlite3';
import fs from 'node:fs';

const db = new Database('./data/ai-chat.db', { readonly: true });
const tables = ['user', 'session', 'account', 'verification'];
const rows = db
	.prepare(
		`SELECT sql FROM sqlite_master
		 WHERE sql IS NOT NULL AND (name IN (${tables.map(() => '?').join(',')}) OR tbl_name IN (${tables.map(() => '?').join(',')}))
		 ORDER BY type DESC, name`
	)
	.all(...tables, ...tables);
const header = `-- 0002_better-auth.sql\n-- better-auth core schema, captured from @better-auth/cli migrate.\n-- Regenerate with: npx @better-auth/cli migrate --config scripts/auth-cli.ts -y\n\n`;
fs.writeFileSync(
	'migrations/0002_better-auth.sql',
	header + rows.map((r) => r.sql + ';').join('\n\n') + '\n'
);
console.log(rows.map((r) => r.sql.split('(')[0].trim()).join('\n'));
