// Public aquariums share the game's pixel sprites; no save data is changed here.
import { fishSprite } from './game/sprites';
import { SPECIES_BY_ID } from '../../shared/src/index';

type Resident = { sp: string; color: number; featured: boolean };
const floorShapes = new Set(['crab', 'shell', 'shrimp']);

const THEMES = new Set(['sand', 'ruins', 'ancient', 'ice', 'aurora', 'coral', 'harbor']);
export function aquariumThemeAsset(theme: string): string {
  return new URL(`./assets/aquariums/${THEMES.has(theme) ? theme : 'sand'}.webp`, import.meta.url).href;
}

/** One renderer, one set of generated pixel-art assets, in the game and on the Hub. */
export function mountAquarium(tank: HTMLElement, theme: string, residents: Resident[]): () => void {
  tank.classList.add('nova-aquarium');
  const backdrop=document.createElement('canvas');backdrop.className='nova-aquarium-scenery';
  backdrop.setAttribute('aria-hidden','true');tank.append(backdrop);
  const artwork=document.createElement('img');artwork.decoding='async';
  let sceneWidth=720,sceneHeight=360,waterLine=240;
  function drawBackground() {
    if(!artwork.naturalWidth)return;
    backdrop.width=720;backdrop.height=Math.round(sceneHeight*720/Math.max(sceneWidth,1));
    const ctx=backdrop.getContext('2d')!, floorY=Math.round(waterLine/sceneHeight*backdrop.height);
    const split=Math.round(artwork.naturalHeight*.75);
    ctx.drawImage(artwork,0,0,artwork.naturalWidth,split,0,0,720,floorY);
    ctx.drawImage(artwork,0,split,artwork.naturalWidth,artwork.naturalHeight-split,0,floorY,720,backdrop.height-floorY);
  }
  artwork.onload=drawBackground;
  artwork.onerror=()=>{ if(theme!=='sand') {artwork.onerror=null;artwork.src=aquariumThemeAsset('sand');} };
  artwork.src=aquariumThemeAsset(theme);
  for(const cls of ['nova-aquarium-light','nova-aquarium-surface','nova-aquarium-bubbles']) {
    const layer=document.createElement('div');layer.className=cls;layer.setAttribute('aria-hidden','true');
    if(cls==='nova-aquarium-bubbles') for(let i=0;i<9;i++) {const bubble=document.createElement('i');bubble.style.left=`${8+i*10}%`;bubble.style.setProperty('--bubble-delay',`${-i*2.3}s`);layer.append(bubble);}
    tank.append(layer);
  }
  let floorCount=0,waterCount=0;
  const actors=residents.flatMap((f,i)=>{
    const sp=SPECIES_BY_ID[f.sp];if(!sp)return [];
    const bottom=floorShapes.has(sp.shape),slot=bottom?floorCount++:waterCount++;
    const canvas=document.createElement('canvas');canvas.className='nova-aquarium-fish'+(bottom?' bottom-dweller':'')+(f.featured?' featured':'');
    Object.assign(canvas.style,{position:'absolute',left:'0',top:'0',margin:'0',animation:'none',maxWidth:'none',zIndex:'2'});
    canvas.setAttribute('role','img');canvas.setAttribute('aria-label',sp.name);
    const frames=[fishSprite(sp,f.color,0),fishSprite(sp,f.color,1)];
    canvas.width=frames[0].width;canvas.height=frames[0].height;tank.append(canvas);
    return [{canvas,frames,shape:sp.shape,bottom,slot,phase:i*2.399,x:0,y:0,w:0,h:0,range:0,lastFrame:-1}];
  });
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let raf=0,last=0,disposed=false;
  function layout() {
    const width=tank.clientWidth,cols=Math.max(1,Math.floor(width/82)),floorRows=Math.ceil(floorCount/cols);
    const waterCols=Math.max(1,Math.floor(width/110)),waterRows=Math.ceil(waterCount/waterCols);
    const waterHeight=Math.max(240,waterRows*67),floorHeight=Math.max(86,floorRows*66+22);
    const height=Math.max(360,waterHeight+floorHeight);
    tank.style.height=`${height}px`;
    sceneWidth=width;sceneHeight=height;waterLine=waterHeight;drawBackground();
    for(const a of actors) {
      const count=a.bottom?floorCount:waterCount,columns=a.bottom?cols:waterCols,rows=Math.ceil(count/columns);
      const row=Math.floor(a.slot/columns),rowCount=Math.min(columns,count-row*columns),cell=width/rowCount;
      const scale=Math.min(2.3,(cell-28)/a.canvas.width,48/a.canvas.height);
      a.w=a.canvas.width*scale;a.h=a.canvas.height*scale;
      a.canvas.style.width=`${a.w}px`;a.canvas.style.height=`${a.h}px`;
      a.x=(a.slot%columns+.5)*cell-a.w/2;
      a.y=a.bottom?waterHeight+18+row*66+(48-a.h):38+row*(waterHeight-55)/Math.max(rows,1);
      a.range=Math.max(0,Math.min(a.bottom?12:22,(cell-a.w)/2-5));
    }
    render(0);
  }
  function render(t: number) {
    for(const a of actors) {
      const p=t+a.phase,still=reduced.matches;
      let dx=still?0:Math.sin(p*(a.bottom?.34:.22))*a.range,dy=0,angle=0;
      if(!still) {
        if(a.shape==='crab') {dy=-Math.abs(Math.sin(p*5))*.9;angle=Math.sin(p*5)*1.2;}
        else if(a.shape==='shrimp') {dy=-Math.pow(Math.max(0,Math.sin(p*1.2)),4)*12;angle=Math.sin(p*1.2)*3;}
        else if(a.shape==='shell') {dx=Math.sin(p*.25)*1.2;dy=-Math.pow(Math.max(0,Math.sin(p*.8)),12)*2;angle=Math.sin(p*.8)*1.3;}
        else dy=Math.sin(p*.8)*5;
      }
      const frame=still?0:Math.floor(p*(a.shape==='crab'?5:2.5))%2;
      if(frame!==a.lastFrame) {const c=a.canvas.getContext('2d')!;c.clearRect(0,0,a.canvas.width,a.canvas.height);c.drawImage(a.frames[frame],0,0);a.lastFrame=frame;}
      a.canvas.style.transform=`translate3d(${a.x+dx}px,${a.y+dy}px,0) rotate(${angle}deg)`;
    }
  }
  function tick(ms:number) {
    raf=0;if(disposed)return;
    if(!tank.isConnected) {dispose();return;}
    if(!document.hidden&&ms-last>=40) {render(ms/1000);last=ms;}
    if(!reduced.matches)raf=requestAnimationFrame(tick);
  }
  function motion() {cancelAnimationFrame(raf);render(0);if(!reduced.matches&&!disposed)raf=requestAnimationFrame(tick);}
  const observer=new ResizeObserver(layout);observer.observe(tank);
  function dispose() {disposed=true;cancelAnimationFrame(raf);observer.disconnect();reduced.removeEventListener('change',motion);artwork.onerror=null;artwork.onload=null;tank.replaceChildren();}
  reduced.addEventListener('change',motion);
  // The caller attaches the finished profile synchronously, before the first frame.
  raf=requestAnimationFrame(()=>{layout();motion();});
  return dispose;
}
