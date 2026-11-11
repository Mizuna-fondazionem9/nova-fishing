import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './ui/App';
import { api, loadMe, setState, getState } from './store';
import { setSound } from './game/audio';

async function boot(): Promise<void> {
  setSound(getState().sound);
  const auth = new URLSearchParams(location.search).get('auth');
  if (auth) history.replaceState(null, '', '/');
  try {
    setState({ loadText: 'Connexion au serveur…', loadPct: 0.1 });
    const cfg = await api<{ devAuth: boolean; discord: boolean }>('/api/config');
    setState({ devAuth: cfg.devAuth, discord: cfg.discord, loadPct: 0.3 });
    const me = await loadMe();
    if (!me) {
      const authError = auth === 'refuse' ? 'Connexion Discord annulée.' : auth ? 'La connexion a échoué. Réessayez.' : null;
      setState({ phase: 'login', authError });
      return;
    }
    setState({ phase: 'game', user: me.user, save: me.save, seed: me.seed, daily: me.daily, loadText: 'Génération de l’océan…', loadPct: 0.4 });
  } catch (e) {
    setState({ phase: 'login', authError: `Serveur injoignable : ${(e as Error).message}` });
  }
}

createRoot(document.getElementById('root')!).render(<App />);
void boot();
