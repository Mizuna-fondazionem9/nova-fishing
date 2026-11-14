import { useEffect, useState } from 'react';
import { dayKey, newAdventure, portContracts, contractProgress, portById, type Contract } from '../../../shared/src/index';
import { useStore, setState, serverNow, portOp } from '../store';
import { Modal, Tabs, Help, Bar, Coins, rt } from './common';
import { DailyContent, TrophiesContent } from './Panels';
import { ExplorationContent } from './Adventure';

function ContractsContent() {
  const save=useStore(s=>s.save)!,seed=useStore(s=>s.seed),hud=useStore(s=>s.hud);
  const a=save.adventure??newAdventure();
  const [busy,setBusy]=useState(false);
  const today=dayKey(serverNow());
  const active=a.active.filter(c=>c.day===today);
  const board=hud?.port?portContracts(seed,hud.port.id,serverNow()).filter(c=>!active.some(v=>v.id===c.id)):[];
  const op=async(action:string,value:string)=>{if(busy)return;setBusy(true);try{await portOp('/api/port/adventure',{action,value});}finally{setBusy(false);}};
  const card=(c:Contract,accepted:boolean)=>{
    const port=portById(seed,c.port),done=a.completed.includes(c.id),progress=accepted?contractProgress(save,c):0;
    const here=hud?.port?.id===c.port;
    return <article className="journal-contract" key={c.id}>
      <div className="row between"><b>{c.label}</b><Coins n={c.reward}/></div>
      <small className="note">{port?.name??c.port} · +{c.rep} réputation</small>
      {accepted && <Bar value={progress} max={c.goal} color="#81c7bc" label={`${Math.min(c.goal,progress)} / ${c.goal}`}/>}
      <Help label="Conditions">{c.kind==='delivery'?'Les prises livrées sont retirées de la cale.':c.kind==='photo'?'Captures à la ligne après acceptation ; prises du chat exclues.':'Nouvelles découvertes après acceptation.'}</Help>
      <div className="row contract-actions">
        {accepted ? <>
          <button disabled={busy||!here||progress<c.goal} onClick={()=>void op('complete',c.id)}>{here?'Remettre':`À remettre au port`}</button>
          {!here && port && <button onClick={()=>{if(rt.game?.goToPort(port))setState({panel:null});}}>Rejoindre</button>}
          <button disabled={busy||!hud?.port} title={!hud?.port?'Abandon disponible au port':undefined} onClick={()=>void op('abandon',c.id)}>Abandonner</button>
        </> : <button disabled={busy||done||active.length>=3} onClick={()=>void op('accept',c.id)}>{done?'Récompense reçue':'Accepter'}</button>}
      </div>
    </article>;
  };
  return <>
    <div className="row between"><b>{active.length} / 3 en cours</b><small className="note">Expiration à 00:00 UTC</small></div>
    {active.length?active.map(c=>card(c,true)):<p className="empty">Aucun contrat en cours. Accepte un contrat au port.</p>}
    <Help label="Règles des contrats">Trois contrats actifs et six récompenses par journée UTC. Remise au port d’origine, abandon depuis un port.</Help>
    {hud?.port && <section className="block">
      <h3>{hud.port.name}</h3>
      <p className="note">Réputation : {a.reputation[hud.port.id]??0} · {(a.reputation[hud.port.id]??0)<100?'Visiteur':(a.reputation[hud.port.id]??0)<250?'Habitué':(a.reputation[hud.port.id]??0)<500?'Navigateur reconnu':'Légende du quai'}</p>
      <h4>Contrats disponibles</h4>
      {board.map(c=>card(c,false))}
    </section>}
  </>;
}

export function LogbookPanel() {
  const tab=useStore(s=>s.journalTab),selected=useStore(s=>s.landmarkId);
  const [explorationOpen,setExplorationOpen]=useState(!!selected);
  useEffect(()=>{if(selected)setExplorationOpen(true);},[selected]);
  const [,tick]=useState(0);
  useEffect(()=>{const id=setInterval(()=>tick(n=>n+1),1000);return()=>clearInterval(id);},[]);
  if(selected)return <ExplorationContent/>;
  return <Modal title="Journal de bord" wide top={<Tabs tabs={[["quests","Quêtes"],["trophies","Trophées"],["contracts","Contrats"]]} value={tab} onChange={journalTab=>setState({journalTab})}/>}>
    <div className="journal-page" key={tab} role="tabpanel" aria-label={{quests:'Quêtes',trophies:'Trophées',contracts:'Contrats'}[tab]}>
      {tab==='quests' && <><DailyContent/><details className="exploration-section" open={explorationOpen} onToggle={e=>setExplorationOpen(e.currentTarget.open)}><summary>Exploration et histoire</summary><ExplorationContent/></details></>}
      {tab==='trophies' && <TrophiesContent/>}
      {tab==='contracts' && <ContractsContent/>}
    </div>
  </Modal>;
}
