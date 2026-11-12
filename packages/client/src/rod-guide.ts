import data from '../../shared/src/rod-guide.json';

export function renderRodGuide(host: HTMLElement): void {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text: string, cls = '') => {
    const e = document.createElement(tag); e.textContent = text; e.className = cls; return e;
  };
  const lead = make('p', 'Commence près du port de départ, dans les eaux côtières, tempérées ou les récifs. Le biome et le niveau régional comptent tous les deux : consulte le niveau indiqué en jeu, puis choisis sa tranche ci-dessous.');
  const label = make('label', 'Niveau régional de ta zone ');
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Tranche de niveau régional');
  for(const [i,band] of data.bands.entries()) {
    const option=make('option',`${band.min} à ${band.max}`);option.value=String(i);select.append(option);
  }
  label.append(select);
  const table=document.createElement('table');table.className='rod-guide-table';
  table.append(make('caption','Niveau conseillé pour chacune des six améliorations de canne'));
  const head=document.createElement('thead'), tr=document.createElement('tr');
  for(const text of ['Zone','Je débute','Je suis à l’aise']) {const th=make('th',text);th.scope='col';tr.append(th);}head.append(tr);table.append(head);
  const body=document.createElement('tbody');table.append(body);
  const draw=()=>{
    const band=data.bands[Number(select.value)||0];body.replaceChildren();
    for(const row of data.rows.filter(r=>r.min===band.min)) {
      const tr=document.createElement('tr'),th=make('th',row.name);th.scope='row';tr.append(th);
      for(const level of [row.debutant,row.moyen])tr.append(make('td',level===null?'Très exigeant, même au maximum':`Niv. ${level}`));
      body.append(tr);
    }
  };select.addEventListener('change',draw);draw();
  const scroll=document.createElement('div');scroll.className='rod-guide-scroll';scroll.append(table);
  host.replaceChildren(lead,label,scroll,
    make('p','Le niveau conseillé concerne puissance, résistance, solidité de la ligne, moulinet, récupération et précision. Une puissance de 8 avec un moulinet de 0 ne correspond donc pas à une canne équilibrée de niveau 8. Les étoiles affichées en jeu ne sont pas ces niveaux d’amélioration.','rod-guide-note'),
    make('p','Repères issus de simulations visant au moins 75 % de captures sur les poissons communs et peu communs, à la limite haute de chaque tranche. Ils ne garantissent pas chaque capture : espèces rares, trophées, géants et crabes demandent une préparation différente. Au-delà du niveau régional 30, la difficulté continue à augmenter.','rod-guide-note'),
    make('p','Si la ligne casse souvent : reviens vers le départ, choisis de petites ombres et renforce d’abord résistance, ligne et puissance. Moulinet et précision rendent les erreurs moins coûteuses. Tu peux explorer une zone avant d’avoir le matériel pour ses grosses prises.','rod-guide-tip'));
}
