import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupCargo, trophyProgress } from '../packages/client/src/ui/menu-data';
import { newSave, SPECIES_BY_ID, rollSpecimen, Rng, cargoBulk, priceOf, TROPHIES } from '../packages/shared/src/index';

test('menus : regrouper la cale conserve les prises, variantes, valeurs et encombrements',()=>{
  const s=newSave(42,0);
  s.cargo=[rollSpecimen(new Rng(1),SPECIES_BY_ID.sardine,1,'coastal',0,'s1'),rollSpecimen(new Rng(2),SPECIES_BY_ID.bar,3,'coastal',0,'b'),rollSpecimen(new Rng(3),SPECIES_BY_ID.sardine,1,'coastal',0,'s2')];
  s.cargo[2].color=3;
  const before=JSON.stringify(s),groups=groupCargo(s.cargo);
  assert.equal(groups.length,2);assert.deepEqual(groups[0].fish.map(f=>f.uid),['s1','s2']);
  assert.equal(groups.reduce((n,g)=>n+g.bulk,0),cargoBulk(s));
  assert.equal(groups.reduce((n,g)=>n+g.value,0),s.cargo.reduce((n,f)=>n+priceOf(f),0));
  assert.equal(JSON.stringify(s),before);assert.deepEqual(groupCargo([]),[]);
});

test('menus : progression des trophées cohérente avec leurs conditions existantes',()=>{
  const s=newSave(42,0);const before=JSON.stringify(s);
  for(const t of TROPHIES){const p=trophyProgress(s,t.id);assert.ok(p,t.id);assert.equal(p!.value>=p!.max,t.test(s),t.id);}
  assert.equal(JSON.stringify(s),before);
  s.stats.caught=100;s.stats.maxKg=500;s.stats.dist=50000;s.stats.earned=1000000;s.stats.underdog=3;
  for(const t of TROPHIES){const p=trophyProgress(s,t.id)!;assert.equal(p.value>=p.max,t.test(s),t.id);}
});

test('menus : rendu des vues, actions conservées et aucune écriture dans la sauvegarde',async()=>{
  const {build}=await import('esbuild');
  const {mkdtempSync,rmSync}=await import('node:fs');
  const {resolve}=await import('node:path');
  const {createRequire}=await import('node:module');
  const dir=mkdtempSync(resolve('tests/.menu-render-'));
  try{
    await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
      import React from 'react';
      import {renderToStaticMarkup} from 'react-dom/server';
      import {ShipPanel,ProfilePanel,PortPanel} from './packages/client/src/ui/Panels';
      import {LogbookPanel} from './packages/client/src/ui/Logbook';
      import {getState,setState} from './packages/client/src/store';
      import {newSave,newAdventure,startPort,rollSpecimen,Rng,SPECIES_BY_ID,dailyChallenges,dayKey,portContracts} from './packages/shared/src/index';
      export function renderMenus(){
        const now=Date.now(),seed=42,save=newSave(seed,now);
        save.adventure=newAdventure();save.coins=5000;
        save.cargo=[rollSpecimen(new Rng(1),SPECIES_BY_ID.sardine,1,'coastal',now,'a'),rollSpecimen(new Rng(2),SPECIES_BY_ID.sardine,1,'coastal',now,'b')];
        const c=portContracts(seed,'0:0',now)[0];c.acceptedAt=now;save.adventure.active=[c];
        const hud={port:startPort(seed),biome:'coastal',level:1,x:save.x,y:save.y};
        setState({save,seed,hud,landmarkId:null,daily:dailyChallenges(dayKey(now),1)} as any);
        const before=JSON.stringify(save),out:any={};
        out.cargo=renderToStaticMarkup(<ShipPanel/>);out.profile=renderToStaticMarkup(<ProfilePanel/>);out.port=renderToStaticMarkup(<PortPanel/>);
        for(const journalTab of ['quests','trophies','contracts'] as const){setState({journalTab});out[journalTab]=renderToStaticMarkup(<LogbookPanel/>);}
        setState({hud:{...hud,port:null} as any});out.atSea=renderToStaticMarkup(<ShipPanel/>);out.contractsAtSea=renderToStaticMarkup(<LogbookPanel/>);
        return {out,before,after:JSON.stringify(getState().save)};
      }
    `},bundle:true,platform:'node',format:'cjs',packages:'external',loader:{'.css':'empty'},outfile:dir+'/render.cjs',logLevel:'silent'});
    const {out,before,after}=createRequire(import.meta.url)(dir+'/render.cjs').renderMenus();
    assert.equal(before,after,'consulter les menus ne modifie pas la progression');
    assert.match(out.cargo,/×2/);assert.match(out.cargo,/Vendre/);assert.match(out.cargo,/Garder/);assert.match(out.cargo,/Relâcher/);
    assert.doesNotMatch(out.cargo,/Améliorations|Quêtes|Contrats|Harpon|Profil et bateau/);
    assert.match(out.atSea,/Relâcher/);assert.doesNotMatch(out.atSea,/>Vendre</);
    assert.match(out.profile,/Profil et bateau/);assert.match(out.profile,/Coque/);assert.match(out.profile,/Équipement/);
    for(const tab of ['quests','trophies','contracts']){assert.match(out[tab],/Journal de bord/);assert.equal((out[tab].match(/role="tab"/g)??[]).length,3);}
    assert.match(out.contracts,/Remettre/);assert.match(out.contracts,/Abandonner/);assert.match(out.contracts,/Accepter/);assert.match(out.contracts,/Port-Nova/);
    assert.match(out.contractsAtSea,/Rejoindre/);assert.doesNotMatch(out.contractsAtSea,/>Accepter</);
    assert.match(out.quests,/Récompense/);assert.match(out.quests,/Exploration et histoire/);assert.match(out.trophies,/À obtenir/);
    assert.match(out.port,/sell-all/);assert.match(out.port,/Criée/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
