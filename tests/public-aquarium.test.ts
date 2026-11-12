import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { existsSync, statSync } from 'node:fs';
import { SPECIES, THEME_NAMES } from '../packages/shared/src/index';
const callbacks=new Map<number,FrameRequestCallback>();let sequence=0,reduced=false;
let resize:()=>void=()=>{};
const dom=()=>({className:'',classList:{add(){}},replaceChildren(){this.children=[];},style:{setProperty(){}},children:[] as any[],setAttribute(){},append(e:any){this.children.push(e);}});
(globalThis as any).document={hidden:false,createElement:(tag:string)=>tag==='canvas'?Object.assign(createCanvas(1,1),dom()):dom()};
(globalThis as any).requestAnimationFrame=(cb:FrameRequestCallback)=>{callbacks.set(++sequence,cb);return sequence;};
(globalThis as any).cancelAnimationFrame=(id:number)=>callbacks.delete(id);
(globalThis as any).matchMedia=()=>({get matches(){return reduced;},addEventListener(){},removeEventListener(){}});
(globalThis as any).window={addEventListener(){},removeEventListener(){}};
(globalThis as any).ResizeObserver=class {constructor(cb:()=>void){resize=cb;}observe(){}disconnect(){}};
const {mountAquarium,aquariumThemeAsset}=await import('../packages/client/src/public-aquarium');
function step(ms:number){const queue=[...callbacks.values()];callbacks.clear();for(const cb of queue)cb(ms);}
const position=(a:any)=>{const m=a.style.transform.match(/translate3d\(([-\d.]+)px,([-\d.]+)px/);return {x:+m[1],y:+m[2],w:parseFloat(a.style.width),h:parseFloat(a.style.height)};};
const floor=SPECIES.filter(s=>['crab','shell','shrimp'].includes(s.shape));
test('seven generated themes are shipped and invalid names fall back to sand',()=>{
 for(const theme of Object.keys(THEME_NAMES)) {
  assert.ok(aquariumThemeAsset(theme).endsWith(`/assets/aquariums/${theme}.webp`));
  const path=`packages/client/public/assets/aquariums/${theme}.webp`;
  assert.ok(existsSync(path));assert.ok(statSync(path).size>10000);
 }
 assert.equal(aquariumThemeAsset('../unknown'),aquariumThemeAsset('sand'));
});
test('64 bottom dwellers remain separated, within the tank, and animate after mobile resize',()=>{
 reduced=false;const tank=Object.assign(dom(),{clientWidth:1000,isConnected:true});
 mountAquarium(tank as any,'coral',Array.from({length:64},(_,i)=>({sp:floor[i%floor.length].id,color:0,featured:false})));
 step(0);step(1000);
 const actors=tank.children.filter(x=>x.className.includes('nova-aquarium-fish'));
 const first=actors.map(a=>a.style.transform);
 for(const width of [1000,390,280]){
  tank.clientWidth=width;resize();
  for(let t=1000;t<=12000;t+=179){step(t);
   const boxes=actors.map(position),height=parseFloat((tank.style as any).height);
   for(const [i,b] of boxes.entries()){
    assert.ok(b.x>=0&&b.x+b.w<=width,`horizontal bounds ${width}/${i}`);
    assert.ok(b.y>=0&&b.y+b.h<=height,`vertical bounds ${width}/${i}`);
    for(const a of boxes.slice(i+1))assert.ok(b.x+b.w<=a.x||a.x+a.w<=b.x||b.y+b.h<=a.y||a.y+a.h<=b.y,`overlap ${width}/${i}`);
   }
  }
 }
 assert.ok(actors.every((a,i)=>a.style.transform!==first[i]));
 tank.isConnected=false;step(13000);assert.equal(callbacks.size,0);
});
test('reduced motion paints every resident once and stops scheduling frames',()=>{
 reduced=true;const tank=Object.assign(dom(),{clientWidth:390,isConnected:true});
 mountAquarium(tank as any,'sand',floor.map(s=>({sp:s.id,color:0,featured:false})));
 step(0);assert.equal(callbacks.size,0);
 assert.ok(tank.children.filter(x=>x.className.includes('nova-aquarium-fish')).every(a=>a.style.transform));
});
