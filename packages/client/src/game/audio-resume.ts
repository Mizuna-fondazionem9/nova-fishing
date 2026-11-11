/** Safari peut annoncer « interrupted » plutôt que « suspended ».
 * Réessayer au prochain geste si la reprise est encore refusée par le navigateur.
 */
export function resumeAudio(context: { state: string; resume?: () => Promise<void> }, hidden: boolean): void {
  if (hidden || context.state === 'running' || context.state === 'closed' || !context.resume) return;
  void context.resume().catch(() => {});
}
