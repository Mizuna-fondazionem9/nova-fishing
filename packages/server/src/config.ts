// Lecture et validation des variables d'environnement. En production, toute variable manquante
// arrête le démarrage avec un message explicite plutôt que de laisser le service tourner à moitié.

export interface Config {
  port: number;
  prod: boolean;
  publicUrl: string;
  databaseUrl: string | null;
  databaseSsl: boolean;
  dbSchema: string;
  worldSeed: number;
  sessionSecret: string;
  discord: { clientId: string; clientSecret: string; redirectUri: string; apiBase: string; authorizeUrl: string };
  devAuth: boolean;
  internalToken: string | null;
  memoryFile: string | null;
  clientDir: string;
  frameAncestors: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const prod = env.NODE_ENV === 'production';
  const errors: string[] = [];
  const need = (name: string): string => {
    const v = env[name]?.trim();
    if (!v && prod) errors.push(`${name} est obligatoire en production`);
    return v ?? '';
  };

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0) errors.push('PORT invalide');

  const publicUrl = (need('PUBLIC_URL') || `http://localhost:${port}`).replace(/\/+$/, '');
  if (prod && !publicUrl.startsWith('https://')) errors.push('PUBLIC_URL doit commencer par https:// en production');

  const databaseUrl = env.DATABASE_URL?.trim() || null;
  if (prod && !databaseUrl) errors.push('DATABASE_URL est obligatoire en production');

  const dbSchema = env.DB_SCHEMA?.trim() || 'nova_fishing';
  if (!/^[a-z_][a-z0-9_]{0,40}$/.test(dbSchema)) errors.push('DB_SCHEMA invalide (lettres minuscules, chiffres, _)');

  const sessionSecret = need('SESSION_SECRET') || 'dev-secret-not-for-production-0123456789';
  if (prod && sessionSecret.length < 32) errors.push('SESSION_SECRET doit faire au moins 32 caractères');

  const devAuth = env.DEV_AUTH === '1';
  if (prod && devAuth) errors.push('DEV_AUTH est interdit en production');

  const worldSeed = Number(env.WORLD_SEED ?? 20261111);
  if (!Number.isInteger(worldSeed) || worldSeed <= 0 || worldSeed > 2 ** 31) errors.push('WORLD_SEED doit être un entier positif');

  const cfg: Config = {
    port, prod, publicUrl, databaseUrl, databaseSsl: env.DATABASE_SSL === '1', dbSchema, worldSeed, sessionSecret,
    discord: {
      clientId: need('DISCORD_CLIENT_ID'),
      clientSecret: need('DISCORD_CLIENT_SECRET'),
      redirectUri: env.DISCORD_REDIRECT_URI?.trim() || `${publicUrl}/auth/discord/callback`,
      apiBase: (env.DISCORD_API_BASE?.trim() || 'https://discord.com/api/v10').replace(/\/+$/, ''),
      authorizeUrl: env.DISCORD_AUTHORIZE_URL?.trim() || 'https://discord.com/oauth2/authorize',
    },
    devAuth,
    internalToken: env.INTERNAL_API_TOKEN?.trim() || null,
    memoryFile: env.MEMORY_STORE_FILE?.trim() || null,
    clientDir: env.CLIENT_DIR?.trim() || '',
    frameAncestors: env.FRAME_ANCESTORS?.trim() || "'self'",
  };
  if (cfg.internalToken && cfg.internalToken.length < 24) errors.push('INTERNAL_API_TOKEN doit faire au moins 24 caractères');
  if (errors.length) throw new Error('Configuration invalide :\n - ' + errors.join('\n - '));
  return cfg;
}
