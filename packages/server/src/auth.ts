// Authentification Discord OAuth2 (Authorization Code + state + PKCE) et sessions par cookie HttpOnly.
// Le secret client ne quitte jamais le serveur ; le navigateur ne voit qu'un jeton de session opaque.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Config } from './config';
import { HttpError, type Ctx } from './http';
import type { Store, PlayerRow } from './store';
import type { Save } from '../../shared/src/index';

const SESSION_COOKIE = 'nf_sid';
const OAUTH_COOKIE = 'nf_oauth';
const SESSION_DAYS = 30;

const b64url = (b: Buffer): string => b.toString('base64url');
const sha256 = (s: string): Buffer => createHash('sha256').update(s).digest();
export const hashToken = (token: string): string => sha256(token).toString('hex');

export function safeEqual(a: string, b: string): boolean {
  const x = sha256(a);
  const y = sha256(b);
  return timingSafeEqual(x, y);
}

export class Auth {
  constructor(private cfg: Config, private store: Store, private makeSave: () => Save) {}

  private sign(payload: string): string {
    return createHmac('sha256', this.cfg.sessionSecret).update(payload).digest('base64url');
  }

  /** Étape 1 : redirection vers Discord avec `state` et défi PKCE. Le vérificateur reste dans un cookie signé. */
  login(ctx: Ctx): void {
    if (!this.cfg.discord.clientId) throw new HttpError(503, 'Connexion Discord non configurée (DISCORD_CLIENT_ID manquant).');
    const state = b64url(randomBytes(16));
    const verifier = b64url(randomBytes(32));
    const payload = `${state}.${verifier}`;
    ctx.setCookie(OAUTH_COOKIE, `${payload}.${this.sign(payload)}`, { maxAge: 600, path: '/auth' });
    const u = new URL(this.cfg.discord.authorizeUrl);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', this.cfg.discord.clientId);
    u.searchParams.set('scope', 'identify');
    u.searchParams.set('redirect_uri', this.cfg.discord.redirectUri);
    u.searchParams.set('state', state);
    u.searchParams.set('code_challenge', b64url(sha256(verifier)));
    u.searchParams.set('code_challenge_method', 'S256');
    ctx.redirect(u.toString());
  }

  /** Étape 2 : retour de Discord. Vérifie `state`, échange le code côté serveur, crée la session. */
  async callback(ctx: Ctx): Promise<void> {
    const raw = ctx.cookies[OAUTH_COOKIE] ?? '';
    ctx.setCookie(OAUTH_COOKIE, '', { maxAge: 0, path: '/auth' });
    if (ctx.url.searchParams.get('error')) return ctx.redirect('/?auth=refuse');
    const [state, verifier, sig] = raw.split('.');
    const code = ctx.url.searchParams.get('code');
    const gotState = ctx.url.searchParams.get('state');
    if (!state || !verifier || !sig || !code || !gotState) throw new HttpError(400, 'Réponse OAuth incomplète.');
    if (!safeEqual(sig, this.sign(`${state}.${verifier}`)) || !safeEqual(gotState, state)) throw new HttpError(400, 'Paramètre « state » invalide.');

    const d = this.cfg.discord;
    const tokenRes = await fetch(`${d.apiBase}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: d.clientId, client_secret: d.clientSecret, grant_type: 'authorization_code',
        code, redirect_uri: d.redirectUri, code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!tokenRes?.ok) throw new HttpError(502, 'Discord a refusé l’échange du code.');
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) throw new HttpError(502, 'Réponse de Discord inattendue.');

    const userRes = await fetch(`${d.apiBase}/users/@me`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!userRes?.ok) throw new HttpError(502, 'Impossible de lire le profil Discord.');
    const u = (await userRes.json()) as { id?: string; username?: string; global_name?: string | null; avatar?: string | null };
    if (!u.id || !/^\d{5,25}$/.test(u.id)) throw new HttpError(502, 'Profil Discord invalide.');
    const name = String(u.global_name || u.username || 'Pêcheur').slice(0, 40);
    const avatar = u.avatar && /^[a-z0-9_]+$/i.test(u.avatar) ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : null;
    const player = await this.store.upsertPlayer(u.id, name, avatar, this.makeSave);
    await this.open(ctx, player);
    ctx.redirect('/');
  }

  /** Connexion de développement (DEV_AUTH=1, jamais en production) : crée un joueur factice. */
  async devLogin(ctx: Ctx): Promise<void> {
    if (!this.cfg.devAuth || this.cfg.prod) throw new HttpError(404, 'Route inconnue.');
    const name = (ctx.url.searchParams.get('name') || 'Testeur').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 24) || 'Testeur';
    const fakeId = String(BigInt('0x' + hashToken('dev:' + name).slice(0, 14)) + 10n ** 17n);
    const player = await this.store.upsertPlayer(fakeId, name, null, this.makeSave);
    await this.open(ctx, player);
    ctx.redirect('/');
  }

  private async open(ctx: Ctx, player: PlayerRow): Promise<void> {
    const token = b64url(randomBytes(32));
    const maxAge = SESSION_DAYS * 86400;
    await this.store.createSession(hashToken(token), player.id, Date.now() + maxAge * 1000);
    ctx.setCookie(SESSION_COOKIE, token, { maxAge });
  }

  async logout(ctx: Ctx): Promise<void> {
    const token = ctx.cookies[SESSION_COOKIE];
    if (token) await this.store.deleteSession(hashToken(token));
    ctx.setCookie(SESSION_COOKIE, '', { maxAge: 0 });
  }

  /** Identifiant du joueur connecté, ou erreur 401. */
  async require(ctx: Ctx): Promise<string> {
    const token = ctx.cookies[SESSION_COOKIE];
    if (!token || token.length > 100) throw new HttpError(401, 'Non connecté.');
    const s = await this.store.getSession(hashToken(token));
    if (!s) throw new HttpError(401, 'Session expirée.');
    return s.playerId;
  }
}
