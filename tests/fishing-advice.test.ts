import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fishingSector, fishingAdvice, zeroLevels, ROD_KEYS, rodStars, netFishingProfile, eligibleNetSpecies, BIOME_IDS } from '../packages/shared/src/index';
test('the visible sector names cover fractional regional levels without gaps',()=>{
 assert.equal(fishingSector(1).name,'Proche du départ');assert.equal(fishingSector(3).name,'Proche du départ');
 assert.equal(fishingSector(3.1).name,'Au large');assert.equal(fishingSector(8.1).name,'Eaux lointaines');
 assert.equal(fishingSector(15.1).name,'Eaux extrêmes');assert.equal(fishingSector(30.1).name,'Au-delà des cartes');
});
test('a specialised rod is rated by the average, without an imposed weakest upgrade',()=>{
 const up=zeroLevels();for(const k of ROD_KEYS)up[k]=10;up.reel=0;
 const advice=fishingAdvice(up,'coastal',1,'debutant');
 assert.equal(advice.state,'ready');assert.equal(advice.stars,8.3);assert.equal('weakest' in advice,false);
 up.reel=10;assert.equal(rodStars(up),10);
 assert.notEqual(fishingAdvice(up,'coastal',10,'debutant').state,'ready');
});
test('unmodelled distant waters never display a false comfortable recommendation',()=>{
 const up=zeroLevels();for(const k of ROD_KEYS)up[k]=50;
 const advice=fishingAdvice(up,'coastal',40,'moyen');assert.equal(advice.target,null);assert.equal(advice.state,'hard');
});

test('stars are the six-level arithmetic mean, with zero and half-star cases; boat upgrades do not count',()=>{
 const up=zeroLevels();assert.equal(rodStars(up),0);
 [8,6,6,0,3,4].forEach((n,i)=>up[ROD_KEYS[i]]=n);assert.equal(rodStars(up),4.5);
 up.speed=50;up.nets=50;up.aquarium=30;assert.equal(rodStars(up),4.5);
 for(const k of ROD_KEYS)up[k]=50;assert.equal(rodStars(up),50);
});
test('net indications distinguish absent nets, insufficient power and a full hold',()=>{
 const up=zeroLevels();assert.equal(netFishingProfile(0,up,'coastal',1).title,'Aucun filet');
 assert.ok(eligibleNetSpecies(1,up,'coastal',1).length>0);
 assert.equal(netFishingProfile(1,up,'coastal',20).title,'Trop faible ici');
 up.nets=50;assert.equal(netFishingProfile(1,up,'coastal',20).state,'ready');
 assert.equal(netFishingProfile(1,up,'coastal',20,true).title,'Cale pleine');
});
test('a net is never presented as operational when no actual species can enter it',()=>{
 const up=zeroLevels();
 for(const biome of BIOME_IDS)for(const level of [1,5,12,25])for(const net of [1,2,3]){
  const profile=netFishingProfile(net,up,biome,level);
  if(profile.state==='ready'||profile.state==='careful')assert.ok(eligibleNetSpecies(net,up,biome,level).length>0);
 }
});
