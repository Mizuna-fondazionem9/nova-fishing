import data from '../../shared/src/rod-guide.json';
import { FISHING_SECTORS } from '../../shared/src/fishing-advice';
export function renderRodGuide(host: HTMLElement): void {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text: string, cls = '') => {
    const e = document.createElement(tag); e.textContent = text; e.className = cls; return e;
  };
  const intro=make('div','','rod-guide-intro');
  intro.append(make('h3','Tu rates tes prises ? Commence ici.'),make('p','Reste près du port de départ et cherche les petites ombres dans les eaux côtières ou les rivières. Les fosses abyssales, la mer spectrale et les eaux mystérieuses sont des destinations pour plus tard.'));
  const locate=make('p','Dans le jeu, le badge sous le nom de ta mer indique ton secteur : « Proche du départ », « Au large »… Il reste visible sur téléphone. Touche-le pour obtenir un conseil adapté à ton matériel.','rod-guide-locate');
  const sectorLabel=make('label','1. Quel secteur est affiché dans ton jeu ? '),sector=document.createElement('select');
  sector.setAttribute('aria-label','Secteur affiché dans le jeu');
  for(const [i,s] of FISHING_SECTORS.entries()){const o=make('option',s.name);o.value=String(i);sector.append(o);}sectorLabel.append(sector);
  const skillLabel=make('label','2. Comment te sens-tu avec la pêche ? '),skill=document.createElement('select');
  for(const [value,text] of [['debutant','Je débute / je rate souvent'],['moyen','Je suis à l’aise avec la jauge']]){const o=make('option',text);o.value=value;skill.append(o);}skillLabel.append(skill);
  const cards=make('div','','rod-guide-cards');cards.setAttribute('aria-live','polite');
  const draw=()=>{
    const band=FISHING_SECTORS[Number(sector.value)||0],field=skill.value==='moyen'?'moyen':'debutant';cards.replaceChildren();
    const rows=data.rows.filter(r=>r.min===band.min).sort((a,b)=>(a[field]??999)-(b[field]??999));
    for(const row of rows){
      const level=row[field],card=make('article','',`rod-zone-card ${level===null?'hard':level<=8?'easy':level<=20?'medium':'hard'}`);
      card.append(make('h3',row.name),make('strong',level===null?'À garder pour plus tard':`Canne équilibrée : niveau ${level}`),make('p',level===null?'Trop exigeant pour pêcher confortablement avec ce profil.':level<=8?'Un bon endroit pour faire ses premières sorties.':level<=20?'Prévois plusieurs améliorations avant de venir.':'Une destination pour du matériel très avancé.'));
      cards.append(card);
    }
  };sector.addEventListener('change',draw);skill.addEventListener('change',draw);draw();
  const help=make('details','','rod-guide-help');help.append(make('summary','« Canne niveau 5 », ça veut dire quoi ?'),make('p','Ouvre Cale → Équipement. Monte les six améliorations de canne autour du niveau annoncé : puissance, résistance, solidité de la ligne, moulinet, récupération et précision. Une puissance de 8 et un moulinet à 0 donnent une canne déséquilibrée. Les étoiles ne correspondent pas à ces niveaux.'));
  const more=make('details','','rod-guide-help');more.append(make('summary','Pourquoi je peux quand même rater un poisson ?'),make('p','Ces repères concernent les poissons courants, pas les prises rares, géantes ou les crabes. Ils visent une pêche plus confortable ; ils ne garantissent pas toutes les captures. Les conseils sont prudents pour couvrir tout le secteur. Après « Eaux extrêmes », continue de te fier au conseil de pêche en jeu : la difficulté peut encore augmenter.'));
  host.replaceChildren(intro,locate,sectorLabel,skillLabel,help,cards,more);
}
