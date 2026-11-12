/** Rendu des vrais sprites Canvas du jeu, sans navigateur et sans asset reconstruit. */
import { createCanvas, type Canvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { SPECIES, SPECIES_BY_ID, BIOME_IDS, BIOMES, VESSELS, PAINTS } from '../packages/shared/src/index';
(globalThis as unknown as {document:unknown}).document={createElement:(tag:string)=>{if(tag!=='canvas')throw new Error(tag);return createCanvas(1,1);}};
const {fishSprite,boatSprite}=await import('../packages/client/src/game/sprites');
const out='docs/art-preview';mkdirSync(out,{recursive:true});
function sheet(title:string, rows:{label:string;sprite:HTMLCanvasElement}[],columns:number,cellW=230,cellH=120){
  const canvas=createCanvas(columns*cellW,80+Math.ceil(rows.length/columns)*cellH),c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
  c.fillStyle='#102431';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='#efdfb9';c.font='bold 22px sans-serif';c.fillText(title,22,40);
  rows.forEach((r,i)=>{
    const x=(i%columns)*cellW,y=80+Math.floor(i/columns)*cellH;
    c.fillStyle='#1b3442';c.fillRect(x+7,y+5,cellW-14,cellH-10);
    const spr=r.sprite as unknown as Canvas,scale=Math.min(3.5,(cellW-35)/spr.width,70/spr.height);
    c.drawImage(spr,x+(cellW-spr.width*scale)/2,y+10+(70-spr.height*scale)/2,spr.width*scale,spr.height*scale);
    c.fillStyle='#e0e9e6';c.font='12px sans-serif';c.textAlign='center';c.fillText(r.label,x+cellW/2,y+cellH-17);c.textAlign='left';
  });return canvas.toBuffer('image/png');
}
writeFileSync(out+'/coquillages-crevettes.png',sheet('Coquillages et crevettes — modèles du jeu',SPECIES.filter(s=>s.shape==='shell'||s.shape==='shrimp').map(s=>({label:s.name,sprite:fishSprite(s)})),3));
writeFileSync(out+'/poissons.png',sheet('36 nouvelles espèces — trois par biome',BIOME_IDS.flatMap(b=>SPECIES.filter(s=>s.detail&&s.biomes[0]===b).map(s=>({label:`${s.name} · ${BIOMES[b].name}`,sprite:fishSprite(s)}))),3,270,120));
writeFileSync(out+'/peintures.png',sheet('Peintures visibles — coque, pont et voiles',VESSELS.flatMap(v=>PAINTS.map((_,i)=>({label:`${v.name} · couleur ${i+1}`,sprite:boatSprite(0,v.id,i)}))),6,170,140));
console.log('Planches générées dans '+out);
