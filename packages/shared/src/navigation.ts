import type { Save } from './save';
import { dayKey } from './save';
import { portById, startPort, PORT_RANGE, type Port } from './world';
import { findPath, type Pt } from './path';

export interface PortDestination { port: Port; reasons: string[]; }

/** Stored port IDs are sufficient: coordinates always come from the seeded world. */
export function portDestinations(save: Save, seed: number, now: number): PortDestination[] {
  const destinations = new Map<string, PortDestination>();
  const add = (id: string, reason: string) => {
    const port = portById(seed, id);
    if (!port) return;
    let d = destinations.get(id);
    if (!d) { d = { port, reasons: [] }; destinations.set(id, d); }
    if (!d.reasons.includes(reason)) d.reasons.push(reason);
  };
  add(save.lastPort, 'Dernier port visité');
  add(startPort(seed).id, 'Port de Nova');
  for (const c of save.adventure?.active ?? []) if (c.day === dayKey(now)) add(c.port, 'Contrat en cours');
  if (save.cat) add(save.cat.port, 'Chat pêcheur');
  return [...destinations.values()];
}

/** A bounded A* leg can end before the final port. Keep the final destination
 * and plan another leg on arrival, instead of silently stopping mid-ocean. */
export class PortNavigation {
  readonly target: Pt;
  constructor(readonly port: Port) { this.target = { x: port.x + .5, y: port.y + .5 }; }
  arrived(from: Pt): boolean { return Math.hypot(from.x-this.target.x, from.y-this.target.y) <= PORT_RANGE; }
  plan(blocked: (x: number, y: number) => boolean, from: Pt, maxNodes = 6000): Pt[] | null {
    if (this.arrived(from)) return [];
    let path = findPath(blocked, from.x, from.y, this.target.x, this.target.y, maxNodes);
    const advances = (p: Pt[] | null) => p?.length && Math.hypot(p[p.length-1].x-from.x,p[p.length-1].y-from.y) > .25;
    if (!advances(path)) path = findPath(blocked, from.x, from.y, this.target.x, this.target.y, 30000);
    return advances(path) ? path : null;
  }
}
