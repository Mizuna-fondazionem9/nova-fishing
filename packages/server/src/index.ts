// Point d'entrée du service. Toute erreur de démarrage (configuration, base, migration) arrête le processus
// avec un message lisible et un code de sortie non nul : Railway affichera l'échec au lieu d'un service zombie.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config';
import { buildServer, makeStore } from './app';

const log = (m: string): void => console.log(`[nova-fishing] ${m}`);

async function main(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.clientDir) {
    const here = dirname(fileURLToPath(import.meta.url));
    cfg.clientDir = [join(here, '..', 'client'), join(here, '..', '..', '..', 'dist', 'client')].find((d) => existsSync(join(d, 'index.html'))) ?? '';
    if (!cfg.clientDir) log('ATTENTION : client non construit (npm run build), seule l’API répondra.');
  }
  const store = makeStore(cfg, log);
  await store.init();
  const built = buildServer(cfg, store, log);
  await new Promise<void>((resolve, reject) => {
    built.server.once('error', reject);
    built.server.listen(cfg.port, '0.0.0.0', resolve);
  });
  log(`Prêt sur le port ${cfg.port} (${cfg.prod ? 'production' : 'développement'}, monde ${cfg.worldSeed}, ${cfg.databaseUrl ? `PostgreSQL schéma ${cfg.dbSchema}` : 'stockage mémoire'})`);

  let closing = false;
  const stop = (signal: string): void => {
    if (closing) return;
    closing = true;
    log(`${signal} reçu, arrêt propre…`);
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    built.close().then(() => process.exit(0), () => process.exit(1));
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}

main().catch((e) => {
  console.error(`[nova-fishing] Démarrage impossible : ${(e as Error).message}`);
  process.exit(1);
});
