// Vérifie la migration et CHAQUE requête de pg-store.ts sur un vrai PostgreSQL, via psql.
// Usage : DATABASE_URL=postgres://... npx tsx scripts/check-sql.ts
// Travaille dans un schéma jetable (nf_check) qu'il supprime à la fin : ne touche à rien d'autre.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { SQL, migrationsDir } from '../packages/server/src/pg-store';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL manquant');
const S = 'nf_check';
const q = Object.fromEntries(Object.entries(SQL).map(([k, v]) => [k, v.replaceAll('%S', `"${S}"`)])) as Record<keyof typeof SQL, string>;

function psql(sql: string): string[] {
  const out = execFileSync('psql', [url!, '-X', '-q', '-At', '-F', '|', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' });
  return out.split('\n').filter((l) => l.length);
}
const lit = (v: unknown): string => (v === null ? 'NULL' : `'${String(v).replaceAll("'", "''")}'`);
let n = 0;
/** Exécute une requête préparée, comme le fait le pilote `pg` (paramètres non typés). */
function run(name: keyof typeof SQL, params: unknown[]): string[] {
  const id = `s${n++}`;
  return psql(`PREPARE ${id} AS ${q[name]}; EXECUTE ${id}${params.length ? `(${params.map(lit).join(', ')})` : ''};`);
}

const dir = migrationsDir();
psql(`DROP SCHEMA IF EXISTS ${S} CASCADE; CREATE SCHEMA ${S};`);
for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort())
  psql(`BEGIN; SET LOCAL search_path TO ${S}; ${readFileSync(join(dir, f), 'utf8')}; COMMIT;`);
console.log('migrations : ok');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const first = run('upsertPlayer', [A, '123456789012345678', 'Alice', null, JSON.stringify({ coins: 40, name: "l'île" })]);
assert.match(first[0], new RegExp(`^${A}\\|123456789012345678\\|Alice\\|\\|`));
const second = run('upsertPlayer', [B, '123456789012345678', 'Alice 2', 'https://cdn/a.png', JSON.stringify({ coins: 0 })]);
assert.match(second[0], new RegExp(`^${A}\\|123456789012345678\\|Alice 2\\|https://cdn/a.png\\|`), 'même compte Discord = même joueur');
assert.ok(second[0].includes('"coins": 40'), 'la sauvegarde existante ne doit pas être écrasée à la reconnexion');
console.log('upsertPlayer : ok');

assert.equal(run('getPlayer', [A]).length, 1);
assert.equal(run('getPlayer', [B]).length, 0);
const locked = psql(`BEGIN; PREPARE l AS ${q.lockSave}; EXECUTE l('${A}'); PREPARE w AS ${q.writeSave}; EXECUTE w('${A}', '{"coins": 99}'); COMMIT;`);
assert.ok(locked[0].startsWith('123456789012345678|'));
assert.ok(run('getPlayer', [A])[0].includes('"coins": 99'));
console.log('lockSave / writeSave : ok');

run('addReward', [B, '123456789012345678', 'trophy:premiere_prise', 'trophy', '{"trophy":"premiere_prise"}']);
run('addReward', [A, '123456789012345678', 'trophy:premiere_prise', 'trophy', '{}']);
const pending = run('listRewards', ['pending', 50]);
assert.equal(pending.length, 1, 'doublon de récompense ignoré');
assert.match(pending[0], new RegExp(`^${B}\\|123456789012345678\\|trophy:premiere_prise\\|trophy\\|.*\\|pending\\|\\d{13}\\|$`));
assert.deepEqual(run('markRewards', [`{${B}}`, 'synced']), []);
assert.equal(run('listRewards', ['pending', 50]).length, 0);
assert.match(run('listRewards', ['synced', 50])[0], /\|synced\|\d{13}\|\d{13}$/);
assert.throws(() => run('markRewards', [`{${B}}`, 'nimporte']), /check constraint|violates/);
console.log('récompenses : ok');

const future = Date.now() + 86_400_000;
run('createSession', ['hash-valide', A, future]);
run('createSession', ['hash-expire', A, Date.now() - 1000]);
const sess = run('getSession', ['hash-valide']);
assert.equal(sess[0], `${A}|${future}`);
assert.equal(run('getSession', ['hash-expire']).length, 0, 'une session expirée est invisible');
run('purgeSessions', []);
assert.equal(psql(`SELECT count(*) FROM ${S}.sessions;`)[0], '1');
run('deleteSession', ['hash-valide']);
assert.equal(psql(`SELECT count(*) FROM ${S}.sessions;`)[0], '0');
assert.throws(() => run('createSession', ['x', B, future]), /foreign key/);
console.log('sessions : ok');

psql(`DROP SCHEMA ${S} CASCADE;`);
console.log('Toutes les requêtes SQL sont valides sur ce PostgreSQL.');
