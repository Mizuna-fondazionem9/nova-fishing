import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSave, migrateSave, maritimeOp, gearOf, CAT_INTERVAL, catReady, treasureAt, nearbyTreasures, SPECIES, BIOME_IDS, Rng, pickSpecies, islandFeature, tileAt, spawnShadows, speciesForShadow, isLand, findPath, startPort, rand2 } from '../packages/shared/src/index';
const seed=20261111;
const start=1000000;
const make=()=>{const s=newSave(seed,start);s.coins=100000;return s;};

test('bateaux : achats permanents, compromis partagés, conservation des dégâts et refus de cale trop pleine',()=>{
  const s=make();s.hull=50;
  const before=s.coins;
  assert.ok(maritimeOp(s,'vessel','trawler','0:0',start,seed).ok);
  assert.equal(s.coins,before-25000);
  assert.equal(s.hull,70);
  assert.equal(gearOf(s.up,s.vessel).hold,40);
  assert.ok(gearOf(s.up,s.vessel).speed<gearOf(s.up).speed);
  assert.ok(maritimeOp(s,'vessel','trawler','0:0',start,seed).ok);
  assert.equal(s.coins,before-25000);assert.equal(s.hull,70);
  s.cargo=Array.from({length:30},(_,i)=>({uid:`f${i}`,sp:'sardine',kg:0.1,len:12,size:0,color:0,tough:false,lvl:1,value:5,at:start,biome:'coastal' as const}));
  assert.equal(maritimeOp(s,'vessel','skiff','0:0',start,seed).ok,false);
  assert.equal(s.vessel,'trawler');
  const old=migrateSave({coins:55},seed,start);assert.equal(old.vessel,'skiff');assert.deepEqual(old.vessels,['skiff']);
});
test('peintures et taille : coût une seule fois, aucune modification des stats par la taille',()=>{
  const s=make(),initial=gearOf(s.up,s.vessel),coins=s.coins;
  for(let i=0;i<2;i++) assert.ok(maritimeOp(s,'paint','2','0:0',start,seed).ok);
  assert.equal(s.coins,coins-350);
  assert.ok(maritimeOp(s,'size','1.15','0:0',start,seed).ok);
  assert.deepEqual(gearOf(s.up,s.vessel),initial);
  assert.equal(maritimeOp(s,'vessel','__proto__','0:0',start,seed).ok,false);
});
test('chat : cadence, port, réserve plafonnée, cale pleine et récupération unique',()=>{
  const s=make();assert.ok(maritimeOp(s,'cat-buy','','0:0',start,seed).ok);
  const now=start+100*CAT_INTERVAL;
  assert.equal(catReady(s,now),6);
  assert.equal(maritimeOp(s,'cat-claim','','1:0',now,seed).ok,false);
  s.cargo=Array.from({length:20},(_,i)=>({uid:`f${i}`,sp:'sardine',kg:0.1,len:12,size:0,color:0,tough:false,lvl:1,value:5,at:start,biome:'coastal' as const}));
  assert.equal(maritimeOp(s,'cat-claim','','0:0',now,seed).ok,false);
  assert.equal(catReady(s,now),6);
  s.cargo=[];
  assert.ok(maritimeOp(s,'cat-claim','','0:0',now,seed).ok);
  assert.equal(s.cargo.length,6);assert.equal(catReady(s,now),0);
  assert.equal(new Set(s.cargo.map(f=>f.uid)).size,6);
  assert.equal(maritimeOp(s,'cat-claim','','0:0',now,seed).ok,false);
  assert.ok(s.cargo.every(f=>f.kg<=0.5 && f.color===0 && f.size===0));
  assert.ok(maritimeOp(s,'cat-move','','1:0',now,seed).ok);
});
test('coffres : positions et récompenses déterministes, pièces 200–300, jamais sur terre',()=>{
  let seen=0;
  for(let cx=-3;cx<=3;cx++)for(let cy=-3;cy<=3;cy++){
    const t=treasureAt(seed,cx,cy,start);if(!t)continue;seen++;
    assert.deepEqual(t,treasureAt(seed,cx,cy,start));
    assert.ok(t.coins>=200&&t.coins<=300);assert.ok(!isLand(seed,Math.floor(t.x),Math.floor(t.y)));
    assert.ok(nearbyTreasures(seed,t.x,t.y,start).some(v=>v.id===t.id));
  }
  assert.ok(seen>30);
});
test('faune : fossiles très rares dans toutes les mers, koïs et crevettes uniquement en rivière',()=>{
  const ancients=SPECIES.filter(s=>s.ancient);assert.equal(ancients.length,5);
  for(const b of BIOME_IDS.filter(b=>b!=='river')) assert.ok(ancients.every(s=>s.biomes.includes(b)));
  assert.ok(SPECIES.some(s=>s.id==='orque'));
  for(const id of ['koi_kohaku','crevette_douce'])assert.deepEqual(SPECIES.find(s=>s.id===id)!.biomes,['river']);
  let fossils=0;const rng=new Rng(42);
  const tile={land:false,h:-0.1,shore:1,depth:0.5,temp:0.5,level:1,biome:'coastal' as const};
  for(let i=0;i<50000;i++)if(pickSpecies(rng,tile,'jour','clair')?.ancient)fossils++;
  assert.ok(fossils>0 && fossils<100,`fréquence fossile incorrecte : ${fossils}/50000`);
});
test('grandes îles : terre et rivière continue, faune d’eau douce et ports conservés',()=>{
  let rivers=0,land=0,fish=0;
  for(let cy=-6;cy<=6 && !rivers;cy++)for(let cx=-6;cx<=6 && !rivers;cx++){
    if(rand2(seed+310,cx,cy)>0.22)continue;
    const ix=cx*480+240+(rand2(seed+311,cx,cy)-0.5)*80;
    const iy=cy*480+240+(rand2(seed+312,cx,cy)-0.5)*80;
    if(!islandFeature(seed,ix,iy)?.river)continue;
    for(let dx=-35;dx<=35;dx++){
      const x=Math.round(ix+dx),y=Math.round(iy+Math.sin(dx/24)*7);
      const t=tileAt(seed,x,y);assert.equal(t.land,false);assert.equal(t.biome,'river');rivers++;
    }
    for(let dy=-30;dy<=30;dy+=5)if(tileAt(seed,Math.round(ix),Math.round(iy+dy)).land)land++;
    assert.ok(findPath((x,y)=>isLand(seed,x,y),Math.round(ix-35),Math.round(iy+Math.sin(-35/24)*7),Math.round(ix+35),Math.round(iy+Math.sin(35/24)*7),5000));
    for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)for(const sh of spawnShadows(seed,Math.floor(ix/32)+x,Math.floor(iy/32)+y,50))if(sh.biome==='river'){
      const sp=speciesForShadow(new Rng(4),seed,sh);assert.ok(sp?.sp.biomes.includes('river'));fish++;
    }
  }
  assert.ok(rivers>0&&land>0&&fish>0);
  const p=startPort(seed);assert.ok(!isLand(seed,p.x,p.y));
});
