// Public aquariums share the game's pixel sprites; no save data is changed here.
import { fishSprite } from './game/sprites';
import { SPECIES_BY_ID } from '../../shared/src/index';

type Resident = { sp: string; color: number; featured: boolean };
const floorShapes = new Set(['crab', 'shell', 'shrimp']);

/** Deterministic, layered underwater scenery at a fixed pixel-art resolution. */
export function paintAquarium(canvas: HTMLCanvasElement, theme: string): void {
  canvas.width = 720; canvas.height = 420;
  const c = canvas.getContext('2d')!;
  let seed = 7341;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const palettes: Record<string, string[]> = {
    sand: ['#287d89', '#123f58', '#092839', '#c8b58a', '#536f62'],
    ruins: ['#326b70', '#16394d', '#0a2336', '#869c88', '#476873'],
    ancient: ['#28675f', '#123f45', '#082a32', '#8caa89', '#476b64'],
    ice: ['#7abdc8', '#326a92', '#183a63', '#c2dce0', '#668caa'],
    aurora: ['#284e73', '#24345d', '#12283e', '#8799b5', '#435a7b'],
    coral: ['#338d9b', '#1b527b', '#123558', '#d4baa1', '#516e87'],
    harbor: ['#527f89', '#285265', '#172f45', '#aa9976', '#52676d'],
  };
  const p = palettes[theme] ?? palettes.sand;
  const water = c.createLinearGradient(0, 0, 0, 420);
  water.addColorStop(0, p[0]); water.addColorStop(.5, p[1]); water.addColorStop(1, p[2]);
  c.fillStyle = water; c.fillRect(0, 0, 720, 420);
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const rock = (x: number, y: number, w: number, h: number, color = p[4]) => {
    c.fillStyle = color; c.beginPath(); c.moveTo(x-w/2,y);
    c.lineTo(x-w*.42,y-h*.6); c.lineTo(x-w*.16,y-h); c.lineTo(x+w*.23,y-h*.92);
    c.lineTo(x+w*.5,y-h*.35); c.lineTo(x+w*.5,y); c.closePath(); c.fill();
    c.fillStyle='#09243222';c.beginPath();c.moveTo(x+w*.23,y-h*.92);c.lineTo(x+w*.5,y-h*.35);c.lineTo(x+w*.5,y);c.lineTo(x,y);c.closePath();c.fill();
    rect(x-w*.18,y-h*.9,w*.34,3,'#d5ede52a'); rect(x-w*.4,y-h*.45,w*.18,3,'#061a2930');
    for(let k=0;k<Math.round(w*h/120);k++) {
      const tx=x-w*.3+rnd()*w*.6,ty=y-h*.15-rnd()*h*.55;
      rect(tx,ty,2+rnd()*5,1,rnd()>.5?'#d7e9ce25':'#071e3328');
    }
    for(let k=1;k<4;k++)rect(x-w*.25,y-h*k*.2,w*(.15+rnd()*.3),1,'#152e3c25');
  };
  // Distant silhouettes, then mineral strata and the sloping sand bed.
  c.globalAlpha = .28;
  for (let i=0;i<14;i++) rock(i*59,326,65+rnd()*70,40+rnd()*95);
  c.globalAlpha = 1;
  for (let x=0;x<720;x+=3) {
    const y=323+Math.sin(x*.012)*9+Math.sin(x*.027)*5;
    rect(x,y,3,420-y,p[3]); rect(x,y,3,3,'#e9e6c13b');
    rect(x,y+17+Math.sin(x*.019)*5,3,2,'#455b6526');
    rect(x,y+53+Math.sin(x*.023)*4,3,3,'#455b6526');
  }
  for(let i=0;i<1800;i++) {
    const x=rnd()*720,y=339+rnd()*81;
    rect(x,y,1+rnd()*3,1,rnd()>.5?'#f8e8c32e':'#273e4b2e');
  }
  const plant = (x: number, y: number, h: number, hue = '#286c62') => {
    for(let stem=0;stem<5;stem++) {
      const height=h*(.45+rnd()*.55),base=x+(stem-2)*5;
      for(let k=0;k<height;k+=3) {
        const sway=Math.sin(k*.055+stem)*7;
        rect(base+sway,y-k,3,4,hue);
        if(k%12===0) rect(base+sway+(stem%2?-6:2),y-k-3,6,3,'#70ae8c85');
      }
    }
  };
  plant(30,352,117); plant(676,354,148); plant(115,331,58,'#3b7c70');
  rock(66,370,94,43); rock(638,370,106,51);
  if(theme==='ruins'||theme==='ancient') {
    // Weathered masonry arch, broken pillars and scattered engraved slabs.
    const stone=theme==='ancient'?'#739c8a':'#81979a';
    for(const x of [468,560]) {
      rect(x,215,23,110,stone); rect(x-5,212,33,9,'#adc0ab'); rect(x-4,317,31,10,'#526d70');
      for(let y=228;y<315;y+=18) rect(x+3,y,16,2,'#425c65');
    }
    c.strokeStyle=stone; c.lineWidth=19; c.beginPath(); c.arc(525,216,46,Math.PI,0); c.stroke();
    for(let i=0;i<9;i++) {const x=415+rnd()*190,y=337+rnd()*44;rect(x,y,20+rnd()*20,8,stone);rect(x+3,y+2,9,1,'#c1d5bb70');}
    for(const x of [468,560]) {
      rect(x+15,253,2,12,'#344e54');rect(x+12,264,4,2,'#344e54');rect(x+11,266,2,11,'#344e54');
      for(let k=0;k<18;k++)rect(x+rnd()*20,218+rnd()*99,2,1,'#c2d5bb55');
    }
    plant(580,339,78); plant(478,334,42);
    if(theme==='ancient') for(let i=0;i<7;i++) rect(512+i*3,238+i%3*8,2,4,'#83f4cf99');
  } else if(theme==='coral') {
    for(let i=0;i<26;i++) {
      const x=i<13?35+i*9:560+(i-13)*10,y=351+rnd()*24,h=20+rnd()*66;
      const col=['#ce7896','#e4a288','#998ac3','#72a5ae'][i%4];
      rect(x,y-h,5,h,col); rect(x-8,y-h*.7,11,4,col);rect(x-9,y-h*.7-12,4,15,col);
      rect(x+3,y-h*.45,12,4,col);rect(x+12,y-h*.45-17,4,18,col);
      rect(x,y-h,3,3,'#fbe2cc');
    }
  } else if(theme==='ice') {
    for(let i=0;i<11;i++) {
      const x=i*74,h=24+rnd()*55;
      c.fillStyle=i%2?'#c6eef0a0':'#90c9dc99';c.beginPath();c.moveTo(x,0);c.lineTo(x+29,h);c.lineTo(x+53,0);c.fill();
    }
    for(const x of [97,590,648]) {
      rock(x,348,53,70+rnd()*45,'#9ac6da');rect(x-6,286,3,40,'#e0f6f0aa');
    }
  } else if(theme==='harbor') {
    for(const x of [114,594]) {rect(x,0,17,335,'#5b615b');rect(x+3,0,3,328,'#af9f7544');for(let y=24;y<320;y+=47)rect(x-3,y,23,5,'#333f46');plant(x+6,341,48);}
    rect(440,300,58,41,'#775b46');for(let y=304;y<340;y+=9)rect(442,y,54,2,'#b09469');rect(447,300,4,41,'#384651');rect(488,300,4,41,'#384651');
    c.strokeStyle='#738580';c.lineWidth=6;c.beginPath();c.arc(535,311,26,.2,Math.PI*1.9);c.stroke();
  } else if(theme==='aurora') {
    for(let i=0;i<7;i++) {
      const glow=c.createLinearGradient(0,0,0,300);glow.addColorStop(0,'#87e5c335');glow.addColorStop(1,'#8b80cc00');
      c.fillStyle=glow;c.beginPath();c.moveTo(65+i*78,0);c.bezierCurveTo(180+i*65,100,20+i*85,160,130+i*77,290);c.lineTo(170+i*77,290);c.bezierCurveTo(60+i*85,160,220+i*65,100,115+i*78,0);c.fill();
    }
    for(let i=0;i<18;i++) {const x=rnd()*720,y=348+rnd()*45;rock(x,y,8+rnd()*10,12+rnd()*24,'#7784af');rect(x,y-12,2,4,'#c7eadc');}
  } else {
    rock(525,345,83,47);plant(545,345,76);
    for(let i=0;i<9;i++) {const x=160+rnd()*390,y=350+rnd()*44;rock(x,y,9+rnd()*13,4+rnd()*7,'#7d8d7b');}
  }
  // Suspended particles and a soft surface glow provide depth without hiding sprites.
  // Reflected light broken into small caustic ribbons across the substrate.
  c.globalAlpha=.12;
  for(let row=0;row<5;row++)for(let x=0;x<720;x+=5) {
    const y=341+row*16+Math.sin(x*.035+row*1.8)*4;
    if(Math.sin(x*.017+row*2)>.1)rect(x,y,5,1,'#f0fbd7');
  }
  c.globalAlpha=1;
  for(let i=0;i<95;i++) rect(rnd()*720,15+rnd()*300,1+rnd()*2,1+rnd()*2,'#ddfff02a');
  const glow=c.createRadialGradient(300,0,10,300,0,360);
  glow.addColorStop(0,'#caffef24');glow.addColorStop(1,'#caffef00');c.fillStyle=glow;c.fillRect(0,0,720,420);
}

export function mountAquarium(tank: HTMLElement, theme: string, residents: Resident[]): void {
  const backdrop=document.createElement('canvas');backdrop.className='aquarium-scenery';backdrop.setAttribute('aria-hidden','true');
  Object.assign(backdrop.style,{position:'absolute',inset:'0',width:'100%',height:'100%',imageRendering:'pixelated',pointerEvents:'none'});
  const scenery=document.createElement('canvas');paintAquarium(scenery,theme);tank.append(backdrop);
  for(const cls of ['aquarium-light','aquarium-surface','aquarium-bubbles']) {
    const layer=document.createElement('div');layer.className=cls;layer.setAttribute('aria-hidden','true');
    if(cls==='aquarium-bubbles') for(let i=0;i<9;i++) {const bubble=document.createElement('i');bubble.style.left=`${8+i*10}%`;bubble.style.setProperty('--bubble-delay',`${-i*2.3}s`);layer.append(bubble);}
    tank.append(layer);
  }
  let floorCount=0,waterCount=0;
  const actors=residents.flatMap((f,i)=>{
    const sp=SPECIES_BY_ID[f.sp];if(!sp)return [];
    const bottom=floorShapes.has(sp.shape),slot=bottom?floorCount++:waterCount++;
    const canvas=document.createElement('canvas');canvas.className='public-sprite tank-fish'+(bottom?' bottom-dweller':'')+(f.featured?' featured':'');
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
    const waterHeight=Math.max(190,waterRows*67),floorHeight=Math.max(86,floorRows*66+22);
    const height=Math.max(360,waterHeight+floorHeight);
    tank.style.height=`${height}px`;
    backdrop.width=720;backdrop.height=Math.round(height*720/Math.max(width,1));
    const ctx=backdrop.getContext('2d')!;ctx.imageSmoothingEnabled=false;
    const floorY=Math.round(waterHeight/height*backdrop.height);
    ctx.drawImage(scenery,0,0,720,323,0,0,720,floorY);
    ctx.drawImage(scenery,0,323,720,97,0,floorY,720,backdrop.height-floorY);
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
  function dispose() {disposed=true;cancelAnimationFrame(raf);observer.disconnect();reduced.removeEventListener('change',motion);window.removeEventListener('pagehide',dispose);}
  reduced.addEventListener('change',motion);window.addEventListener('pagehide',dispose,{once:true});
  // The caller attaches the finished profile synchronously, before the first frame.
  raf=requestAnimationFrame(()=>{layout();motion();});
}
