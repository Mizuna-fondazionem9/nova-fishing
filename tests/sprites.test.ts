import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
import { SPECIES, SPECIES_BY_ID, BIOME_IDS, VESSELS, PAINTS } from '../packages/shared/src/index';
(globalThis as unknown as {document:unknown}).document={createElement:()=>createCanvas(1,1)};
const {fishSprite,boatSprite}=await import('../packages/client/src/game/sprites');
const pixels=(s:HTMLCanvasElement)=>s.getContext('2d')!.getImageData(0,0,s.width,s.height).data;
const hash=(s:HTMLCanvasElement,mask=false)=>{const data=pixels(s);return createHash('sha256').update(mask?Uint8Array.from(data.filter((_,i)=>i%4===3)):data).digest('hex');};
test('coquillages : silhouettes distinctes, crevettes détaillées et palettes différentes',()=>{
  const shells=SPECIES.filter(s=>s.shape==='shell');
  assert.equal(new Set(shells.map(s=>hash(fishSprite(s),true))).size,shells.length);
  const a=fishSprite(SPECIES_BY_ID.crevette_douce),b=fishSprite(SPECIES_BY_ID.crevette_jade);
  assert.notEqual(hash(a),hash(b));assert.equal(a.width,48);
  assert.ok(Array.from(pixels(a)).filter((v,i)=>i%4===3&&v>0).length>150);
});
test('chaque biome reçoit trois poissons à silhouettes et palettes identifiables',()=>{
  for(const biome of BIOME_IDS){
    const fish=SPECIES.filter(s=>s.detail&&s.biomes[0]===biome);assert.equal(fish.length,3);
    assert.equal(new Set(fish.map(s=>hash(fishSprite(s),true))).size,3,biome);
    assert.equal(new Set(fish.map(s=>hash(fishSprite(s)))).size,3);
  }
});
test('les peintures changent une part importante du bateau, quel que soit le modèle',()=>{
  for(const model of VESSELS)for(let paint=1;paint<PAINTS.length;paint++){
    const a=pixels(boatSprite(0,model.id,0)),b=pixels(boatSprite(0,model.id,paint));let changed=0,total=0;
    for(let i=0;i<a.length;i+=4)if(a[i+3]){total++;if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])changed++;}
    assert.ok(changed/total>.45,`${model.id}/${paint}: ${changed}/${total}`);
  }
});
