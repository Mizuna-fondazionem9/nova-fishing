// Mini-serveur HTTP sans dépendance : routeur, cookies, corps JSON borné, fichiers statiques, limitation de débit.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface CookieOpts {
  maxAge?: number;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Lax' | 'Strict' | 'None';
}

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  ip: string;
  cookies: Record<string, string>;
  body: Record<string, unknown>;
  setCookie(name: string, value: string, opts?: CookieOpts): void;
  redirect(location: string): void;
}

export type Handler = (ctx: Ctx) => unknown | Promise<unknown>;
/** Valeur spéciale : le gestionnaire a déjà répondu lui-même. */
export const HANDLED = Symbol('handled');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.map': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k || k in out) continue;
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* cookie illisible : ignoré */
    }
  }
  return out;
}

/** Seau à jetons en mémoire : `capacity` requêtes d'un coup, rechargé à `perSec` par seconde. */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();
  constructor(private capacity: number, private perSec: number) {}
  take(key: string, now = Date.now()): boolean {
    let b = this.buckets.get(key);
    if (!b) {
      if (this.buckets.size > 50_000) this.buckets.clear();
      b = { tokens: this.capacity, at: now };
      this.buckets.set(key, b);
    }
    b.tokens = Math.min(this.capacity, b.tokens + ((now - b.at) / 1000) * this.perSec);
    b.at = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }
}

async function readJson(req: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  const type = String(req.headers['content-type'] ?? '');
  if (!type.startsWith('application/json')) throw new HttpError(415, 'Corps JSON attendu.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, 'Requête trop volumineuse.');
    chunks.push(chunk as Buffer);
  }
  if (!size) return {};
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'JSON invalide.');
  }
}

export interface AppOptions {
  prod: boolean;
  staticDir: string | null;
  frameAncestors: string;
  /** Origine publique attendue pour les requêtes qui modifient l'état (protection CSRF). */
  origin: string;
  /**
   * Préfixe public du jeu ('' ou '/fishing'). Les requêtes sont acceptées avec ou sans ce préfixe
   * (selon que le relais en amont le retire ou non) ; redirections, cookies et page d'accueil le portent toujours.
   */
  basePath?: string;
  log?: (msg: string) => void;
}

export class App {
  private routes = new Map<string, Handler>();
  private global = new RateLimiter(60, 20);
  constructor(private opts: AppOptions) {}

  get(path: string, h: Handler): void {
    this.routes.set(`GET ${path}`, h);
  }
  post(path: string, h: Handler): void {
    this.routes.set(`POST ${path}`, h);
  }

  handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const started = Date.now();
    const url = new URL(req.url ?? '/', 'http://local');
    const base = this.opts.basePath ?? '';
    if (base && (url.pathname === base || url.pathname.startsWith(base + '/'))) url.pathname = url.pathname.slice(base.length) || '/';
    const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    const ip = fwd || req.socket.remoteAddress || '?';
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader(
      'Content-Security-Policy',
      // Les polices sont celles du site NovaBot (Google Fonts) : seules exceptions à « tout vient d'ici ».
      `default-src 'self'; img-src 'self' data: https://cdn.discordapp.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; base-uri 'self'; frame-ancestors ${this.opts.frameAncestors}`,
    );
    if (this.opts.prod) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const cookiesOut: string[] = [];
    const ctx: Ctx = {
      req, res, url, ip, cookies: parseCookies(req.headers.cookie), body: {},
      setCookie: (name, value, o = {}) => {
        const path = (base + (o.path ?? '/')).replace(/(.)\/$/, '$1');
        let c = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${o.sameSite ?? 'Lax'}`;
        if (o.maxAge !== undefined) c += `; Max-Age=${Math.floor(o.maxAge)}`;
        if (o.httpOnly !== false) c += '; HttpOnly';
        if (o.secure ?? this.opts.prod) c += '; Secure';
        cookiesOut.push(c);
        res.setHeader('Set-Cookie', cookiesOut);
      },
      redirect: (location) => {
        res.statusCode = 302;
        // Les redirections internes ('/…') restent sous le préfixe public ; les adresses complètes (Discord) sont laissées telles quelles.
        res.setHeader('Location', location.startsWith('/') && !location.startsWith('//') ? base + location : location);
        res.end();
      },
    };
    try {
      const method = req.method ?? 'GET';
      const handler = this.routes.get(`${method} ${url.pathname}`);
      if (handler) {
        if (!this.global.take(ip)) throw new HttpError(429, 'Trop de requêtes, ralentissez.');
        if (method === 'POST') {
          // Anti-CSRF : cookie SameSite=Lax + corps JSON obligatoire + origine vérifiée + en-tête personnalisé.
          const origin = req.headers.origin;
          if (origin && origin !== this.opts.origin) throw new HttpError(403, 'Origine refusée.');
          if (url.pathname.startsWith('/api/') && req.headers['x-nf-client'] !== '1') throw new HttpError(403, 'En-tête client manquant.');
          ctx.body = await readJson(req, 64 * 1024);
        }
        const out = await handler(ctx);
        if (out !== HANDLED && !res.writableEnded) {
          res.statusCode = res.statusCode || 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(out ?? {}));
        }
      } else if (method === 'GET' || method === 'HEAD') {
        if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/internal/')) throw new HttpError(404, 'Route inconnue.');
        await this.serveStatic(url.pathname, res, method === 'HEAD');
      } else throw new HttpError(404, 'Route inconnue.');
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status >= 500) this.opts.log?.(`ERREUR ${req.method} ${url.pathname} : ${(e as Error).stack ?? e}`);
      if (!res.headersSent) {
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
      }
      if (!res.writableEnded) res.end(JSON.stringify({ error: status >= 500 ? 'Erreur interne du serveur.' : (e as Error).message }));
    } finally {
      if (url.pathname.startsWith('/api/') && Date.now() - started > 1500) this.opts.log?.(`LENT ${url.pathname} ${Date.now() - started} ms`);
    }
  };

  private async serveStatic(pathname: string, res: ServerResponse, head: boolean): Promise<void> {
    const root = this.opts.staticDir;
    if (!root) throw new HttpError(404, 'Introuvable.');
    let rel: string;
    try {
      rel = normalize(decodeURIComponent(pathname));
    } catch {
      throw new HttpError(400, 'Chemin invalide.');
    }
    if (rel.includes('\0') || rel.split(sep).includes('..')) throw new HttpError(400, 'Chemin invalide.');
    let file = join(root, rel);
    let stat = await fs.stat(file).catch(() => null);
    if (!stat || stat.isDirectory()) {
      if (extname(rel)) throw new HttpError(404, 'Introuvable.');
      file = join(root, 'index.html'); // application monopage
      stat = await fs.stat(file).catch(() => null);
      if (!stat) throw new HttpError(404, 'Client non construit : lancez « npm run build ».');
    }
    const base = this.opts.basePath ?? '';
    // La page d'accueil annonce le préfixe au navigateur : toutes ses adresses relatives en découlent.
    const page = file.endsWith('index.html') ? Buffer.from((await fs.readFile(file, 'utf8')).replace('<base href="/" />', `<base href="${base}/" />`)) : null;
    const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}${page ? '-' + base.length.toString(16) : ''}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
    if (res.req.headers['if-none-match'] === etag) {
      res.statusCode = 304;
      res.end();
      return;
    }
    res.setHeader('Content-Length', page ? page.length : stat.size);
    if (head) {
      res.end();
      return;
    }
    if (page) {
      res.end(page);
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const s = createReadStream(file);
      s.on('error', reject);
      s.on('end', resolve);
      s.pipe(res);
    });
  }
}

// ---------- Petits validateurs d'entrée ----------

export function num(v: unknown, name: string, min = -1e9, max = 1e9): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new HttpError(400, `Champ « ${name} » invalide.`);
  return v;
}
export function str(v: unknown, name: string, maxLen = 200): string {
  if (typeof v !== 'string' || !v || v.length > maxLen) throw new HttpError(400, `Champ « ${name} » invalide.`);
  return v;
}
