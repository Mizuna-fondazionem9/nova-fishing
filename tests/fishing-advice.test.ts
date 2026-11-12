import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fishingSector, fishingAdvice, zeroLevels, ROD_KEYS } from '../packages/shared/src/index';
test('the visible sector names cover fractional regional levels without gaps',()=>{
 assert.equal(fishingSector(1).name,'Proche du départ');assert.equal(fishingSector(3).name,'Proche du départ');
 assert.equal(fishingSector(3.1).name,'Au large');assert.equal(fishingSector(8.1).name,'Eaux lointaines');
 assert.equal(fishingSector(15.1).name,'Eaux extrêmes');assert.equal(fishingSector(30.1).name,'Au-delà des cartes');
});
test('advice identifies an unupgraded reel rather than treating rod power as the whole equipment level',()=>{
 const up=zeroLevels();for(const k of ROD_KEYS)up[k]=10;up.reel=0;
 const advice=fishingAdvice(up,'coastal',1);
 assert.equal(advice.state,'hard');assert.equal(advice.weakest,'Moulinet');
 up.reel=10;assert.equal(fishingAdvice(up,'coastal',1).state,'ready');
 assert.notEqual(fishingAdvice(up,'coastal',10).state,'ready');
});
test('unmodelled distant waters never display a false comfortable recommendation',()=>{
 const up=zeroLevels();for(const k of ROD_KEYS)up[k]=50;
 const advice=fishingAdvice(up,'coastal',40,'moyen');assert.equal(advice.target,null);assert.equal(advice.state,'hard');
});
