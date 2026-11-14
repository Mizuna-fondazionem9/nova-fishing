// Local fixture only. Run after npm run build: node --import tsx tests/e2e/menus.ts
import assert from 'node:assert/strict';
import { existsSync,mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium,type Page } from 'playwright';
import {newSave,migrateSave,newAdventure,rollSpecimen,Rng,SPECIES_BY_ID,portContracts,contractProgress} from '../../packages/shared/src/index';
import {buildServer} from '../../packages/server/src/app';
import {MemoryStore} from '../../packages/server/src/store';
import {loadConfig} from '../../packages/server/src/config';
import {hashToken} from '../../packages/server/src/auth';

const seed=20261111,base='http://127.0.0.1:4323',name='Menus-test';
const store=new MemoryStore(raw=>migrateSave(raw,seed,Date.now()));await store.init();
const id=String(BigInt('0x'+hashToken('dev:'+name).slice(0,14))+10n**17n);
const p=await store.upsertPlayer(id,name,null,()=>newSave(seed,Date.now()));
await store.withSave(p.id,s=>{
  s.coins=10000;s.adventure=newAdventure();
  s.cargo=['a','b','c'].map((uid,i)=>rollSpecimen(new Rng(i+1),SPECIES_BY_ID.sardine,1,'coastal',Date.now(),uid));
});
const built=buildServer(loadConfig({NODE_ENV:'development',DEV_AUTH:'1',PUBLIC_URL:base,WORLD_SEED:String(seed),CLIENT_DIR:resolve('dist/client')} as NodeJS.ProcessEnv),store,()=>{});
await new Promise<void>(r=>built.server.listen(4323,'127.0.0.1',r));
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
const shots='tests/e2e/shots/menus';
const assertFits=async(page:Page)=>{
  const fit=await page.locator('.menu-modal').evaluate(el=>{
    const box=el.getBoundingClientRect(),body=el.querySelector('.body')!,close=el.querySelector('.close')!.getBoundingClientRect();
    return box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight&&body.scrollWidth<=body.clientWidth+1&&close.top>=0&&close.bottom<=innerHeight;
  });assert.ok(fit,'fenêtre, fermeture et contenu sans débordement horizontal');
};
try{
  browser=await chromium.launch({executablePath:process.env.CHROME??['/usr/bin/chromium','/usr/bin/google-chrome'].find(existsSync),headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
  const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/auth/dev/login?name='+name);await page.getByTestId('port').waitFor();
  mkdirSync(shots,{recursive:true});
  const before=(await store.getPlayer(p.id))!.save;
  const progress=(s:typeof before)=>JSON.stringify({cargo:s.cargo,coins:s.coins,up:s.up,xp:s.xp,trophies:s.trophies});
  const beforeProgress=progress(before);
  for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1280,height:850}]){
    await page.setViewportSize(viewport);
    const tag=viewport.width+'x'+viewport.height;
    await page.getByRole('navigation').getByRole('button',{name:'Cale',exact:true}).click();
    await page.getByRole('dialog',{name:'Cale',exact:true}).waitFor();await assertFits(page);
    assert.equal(await page.locator('.cargo-species').count(),1);
    await page.locator('.cargo-species > summary').click();await assertFits(page);
    assert.equal(await page.getByRole('button',{name:'Relâcher',exact:true}).count(),3);
    await page.screenshot({path:shots+'/'+tag+'-cale.png'});
    await page.getByRole('button',{name:'Fermer',exact:true}).click();
    await page.getByRole('button',{name:'Ouvrir le profil et le bateau'}).click();
    for(const tab of ['Bateau','Équipement','Progression']){await page.getByRole('tab',{name:tab,exact:true}).click();await assertFits(page);}
    await page.screenshot({path:shots+'/'+tag+'-profil.png'});
    await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
    await page.getByRole('navigation').getByRole('button',{name:/Journal/}).click();
    for(const tab of ['Quêtes','Trophées','Contrats']){await page.getByRole('tab',{name:tab,exact:true}).click();await assertFits(page);}
    await page.screenshot({path:shots+'/'+tag+'-journal.png'});
    await page.getByRole('button',{name:'Fermer',exact:true}).click();
  }
  assert.equal(progress((await store.getPlayer(p.id))!.save),beforeProgress,'consultation sans altérer la progression');
  // Existing specimen actions still operate on the selected UID only.
  await page.getByRole('navigation').getByRole('button',{name:'Cale',exact:true}).click();
  await page.locator('.cargo-species > summary').click();
  await page.getByTestId('keep').first().click();
  await page.waitForFunction(()=>(window as any).__nf.getState().save.aquarium.length===1);
  await page.getByRole('button',{name:'Relâcher',exact:true}).first().click();
  await page.waitForFunction(()=>(window as any).__nf.getState().save.cargo.length===1);
  await page.getByRole('button',{name:'Vendre',exact:true}).first().click();
  await page.waitForFunction(()=>(window as any).__nf.getState().save.cargo.length===0);
  await page.getByRole('button',{name:'Fermer',exact:true}).click();
  await page.getByRole('navigation').getByRole('button',{name:/Journal/}).click();
  await page.getByRole('tab',{name:'Contrats',exact:true}).click();
  await page.getByRole('button',{name:'Accepter',exact:true}).first().click();
  await page.getByText('1 / 3 en cours',{exact:true}).waitFor();
  assert.equal((await store.getPlayer(p.id))!.save.adventure!.active.length,1);
  await page.getByRole('button',{name:'Abandonner',exact:true}).click();
  await page.getByText('0 / 3 en cours',{exact:true}).waitFor();
  // Prepare a completed contract using the same server progress computation, then collect via the UI.
  const c=portContracts(seed,'0:0',Date.now()).find(c=>c.kind==='photo')!;
  await store.withSave(p.id,s=>{s.adventure!.active=[{...c,acceptedAt:Date.now(),progress:c.goal}];assert.equal(contractProgress(s,s.adventure!.active[0]),c.goal);});
  await page.reload();await page.getByTestId('port').waitFor();
  await page.getByRole('navigation').getByRole('button',{name:/Journal/}).click();
  await page.getByRole('tab',{name:'Contrats',exact:true}).click();
  const coins=(await store.getPlayer(p.id))!.save.coins;
  await page.getByRole('button',{name:'Remettre',exact:true}).click();
  await page.getByText('0 / 3 en cours',{exact:true}).waitFor();
  assert.equal((await store.getPlayer(p.id))!.save.coins,coins+c.reward);
  assert.deepEqual(errors,[]);
  console.log('Menus : vues mobiles et ordinateur, onglets, fermeture, prises et contrats validés.');
}finally{await browser?.close();await built.close();}
