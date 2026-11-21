// Anatomies absentes des poissons de profil. Les dimensions et caractères
// distinctifs sont renseignés dans chaque fiche, en pixels de la grille native.
import { Grid, mix, shade } from '../pix';
import type { Cols } from '../fish-engine';

export interface AnimalSpec {
  r: 'animal';
  kind: 'seal' | 'jelly' | 'star' | 'urchin' | 'slug' | 'anemone' | 'horseshoe' |
    'plume' | 'bristle' | 'barnacle' | 'isopod' | 'nautilus' | 'hermit';
  w: number;
  h: number;
  count: number;
  reach: number;
  mark: string;
}

export function drawAnimal(s: AnimalSpec, c: Cols, frame: number): Grid {
  const g = new Grid(100, 80);
  const x = 48, y = 36;
  const { w, h, reach, count, mark } = s;
  const ink = shade(c.m, .52), light = shade(c.b, 1.18), edge = shade(c.a, .73);
  const skin = (px: number, py: number) => {
    const tone = mix(c.b, c.m, Math.min(1, Math.max(0, .52 + (py-y)/(2*h) + (px-x)/(8*w))));
    return (px * 3 + py * 7) % 23 === 0 ? mix(tone, c.a, .28) : tone;
  };
  const wave = (k: number) => Math.sin(k + frame * 1.25);
  const eye = (ex: number, ey: number) => { g.disc(ex, ey, 2, 2, ink); g.set(ex, ey-1, light); };
  const turn = 2 * Math.PI;
  switch (s.kind) {
    case 'jelly': {
      const top = y - h, bottom = y + frame;
      for (let i=0; i<count; i++) {
        const u = count === 1 ? 0 : 2*i/(count-1)-1;
        const len = reach * (.65+.35*Math.cos(i*2.2)) + (mark==='crown' && i===2 ? 12 : 0);
        const ox = x+u*w*.91;
        for (let j=0; j<=len; j++) {
          const tx=ox+wave(i+j*.29)*j*.14;
          g.disc(tx,bottom+j,mark==='frill'?2:1,1,i%3 ? c.b : c.a);
        }
      }
      if (mark==='box') g.poly([[x-w,top],[x+w-2,top-1],[x+w,bottom],[x-w,bottom]],skin);
      else if (mark==='comb') g.disc(x,y-1,w,h,skin);
      else for(let j=0;j<=h+frame;j++) {
        const rx = w*Math.sqrt(Math.max(0,1-((j-h-frame)/(h+frame))**2));
        g.line(x-rx,top+j,x+rx,top+j,mix(c.b,c.m,j/(h+frame)));
      }
      if (mark==='rings') for(const dx of [-4,4]) for(const dy of [-1,2]) {
        g.disc(x+dx,y-3+dy,2.2,1.6,c.a);g.set(x+dx,y-3+dy,c.b);
      }
      if (mark==='sail'||mark==='float') g.poly([[x-w+2,top+2],[x+w*.35,top-7],[x+w-2,top+3]],c.a);
      if (mark==='yolk') g.disc(x,top+1,6,4,c.a);
      if (mark==='comb') for(let i=-2;i<=2;i++)g.line(x+i*2,y-h+3,x+i*3,y+h-4,i%2?c.a:light);
      g.line(x-w*.7,bottom,x+w*.7,bottom,c.a);
      break;
    }
    case 'star':
    case 'urchin': {
      const star=s.kind==='star';
      for(let i=0;i<count;i++) {
        const a=turn*i/count-.43, dx=Math.cos(a),dy=Math.sin(a);
        if(star) {
          const spread=mark==='brittle'?.12:mark==='granules'?.72:.29;
          const rootRadius=mark==='brittle'?reach:Math.max(reach,w*.51);
          const tx=x+dx*w,ty=y+dy*h+wave(i)*1.3;
          g.poly([[x+Math.cos(a-spread)*rootRadius,y+Math.sin(a-spread)*rootRadius*.85],
                  [tx,ty],[x+Math.cos(a+spread)*rootRadius,y+Math.sin(a+spread)*rootRadius*.85],[x,y]],skin);
          g.line(x+dx*3,y+dy*3,tx,ty,c.a);
          if(mark==='thorn')for(let j=6;j<w-3;j+=3)g.line(x+dx*j,y+dy*j*h/w,x+dx*j-dy*2,y+dy*j*h/w+dx*2,c.b);
          for(let j=4;j<w-2;j+=3)g.set(x+dx*j-1,y+dy*j*h/w,light);
        } else if(mark!=='petals') {
          g.line(x+dx*w*.6,y+dy*h*.6,x+dx*(w+reach),y+dy*(h+reach)+wave(i),i%3?ink:c.a);
          if(mark==='pencil')g.line(x+dx*w*.6+1,y+dy*h*.6,x+dx*(w+reach)+1,y+dy*(h+reach),c.b);
        }
      }
      g.disc(x,y,star?reach:w,star?reach*.82:h,skin);
      if(mark==='petals')for(let i=0;i<5;i++){const a=turn*i/5;g.line(x,y,x+Math.cos(a)*8,y+Math.sin(a)*5,light);}
      if(mark==='diadem') {g.disc(x,y,3,2,c.a);g.set(x,y,ink);}
      break;
    }
    case 'seal': {
      const neck=x+w-4, hy=y-h*.64, nose=neck+7;
      for(const sign of [-1,1])g.poly([[x-w+5,y],[x-w-8,y+sign*(4+frame*2)],[x-w-4,y+sign*8],[x-w+9,y+sign*2]],ink);
      g.disc(x,y,w,h,skin);
      g.disc(neck,hy,mark==='tusks'?8:6,h*.70,mark==='harp'?ink:skin);
      g.disc(nose,hy+2,mark==='trunk'?5:4,mark==='trunk'?5:3,c.b);
      g.line(nose+1,hy+1,nose+4,hy+1,ink);eye(neck+2,hy-2);
      for(let k=0;k<3;k++)g.line(nose-1,hy+3,nose+6,hy+2+k*2,light);
      if(mark==='tusks')for(const k of [-2,3])g.poly([[nose+k-1,hy+3],[nose+k+2,hy+3],[nose+k-1,hy+13]],light);
      if(mark==='ears'||mark==='otter')g.disc(neck-3,hy-4,2,3,ink);
      if(mark==='harp')g.poly([[x-10,y-4],[x-3,y-4],[x+5,y+2],[x,y+4]],ink);
      if(mark==='leopard'||mark==='weddell')for(let j=0;j<22;j++)g.tint(x-w+2+(j*7)%(w*2-3),y-h+2+j*11%(h*2-3),edge);
      g.poly([[x+2,y+2],[x+7,y+3],[x+2-frame*2,y+h+reach],[x-2-frame*2,y+h+reach-2]],c.m);
      break;
    }
    case 'nautilus':
    case 'hermit': {
      for(let i=0;i<count;i++) {
        const rise=(i/(count-1)-.5)*14;
        g.line(x+w-3,y+2,x+w+reach-2+wave(i)*2,y+4+rise+frame,c.a);
      }
      g.disc(x,y,w,h,skin);
      for(let j=0;j<130;j++) {
        const a=j*.092,rad=j/135;g.set(x+Math.cos(a)*w*rad,y+Math.sin(a)*h*rad,edge);
      }
      if(mark!=='hermit')for(let k=0;k<8;k++){
        const a=Math.PI+k*Math.PI/8;
        g.line(x+Math.cos(a)*w*.7,y+Math.sin(a)*h*.7,x+Math.cos(a)*w*.96,y+Math.sin(a)*h*.96,c.a);
      }
      g.disc(x+w,y+2,4,3,c.m);eye(x+w+2,y);
      break;
    }
    case 'anemone':
    case 'plume':
    case 'barnacle': {
      const baseY=y+10;
      if(s.kind==='anemone')g.disc(x,baseY,w,h,c.m);
      for(let i=0;i<count;i++){
        const u=count===1?0:2*i/(count-1)-1;
        const root=x+u*w*.65, tip=root+u*reach*.72+wave(i)*1.5;
        const ty=y-h/2-reach*(.58+.39*Math.cos(i*2.3));
        g.line(root,baseY,tip,ty,s.kind==='plume'?c.b:edge);
        if(mark==='twins'||mark==='tubes'){
          const tiers=mark==='twins'?9:6;
          for(let j=0;j<tiers;j++){const width=(tiers-j)*.92;g.disc(tip,ty-j*1.4,width,2.2,j%2?c.a:c.m);}
        }else if(mark==='plates'){g.disc(tip,ty,3.5,5,c.b);g.line(tip-1,ty-3,tip+1,ty+2,ink);}
        else g.disc(tip,ty,1.8,2,c.b);
      }
      g.disc(x,baseY+2,w,3,skin);
      break;
    }
    case 'horseshoe':
    case 'isopod':
    case 'slug':
    case 'bristle': {
      g.disc(x,y,w,h,skin);
      if(mark==='telson'){
        g.poly([[x-w+1,y-3],[x-w-reach,y+frame],[x-w+1,y+3]],ink);
        g.disc(x+w*.25,y,w*.8,h+2,skin);
        for(const k of [-1,1])g.set(x+w*.5,y+k*3,ink);
      } else for(let i=0;i<count;i++){
        const u=count===1?.5:i/(count-1),sx=x-w+2+u*(2*w-4);
        const radius=h*Math.sqrt(Math.max(.05,1-(u*2-1)**2));
        if(mark==='segments')g.line(sx,y-radius+1,sx+1,y+radius-1,edge);
        for(const sign of [-1,1]){
          const sy=y+sign*radius*.8;
          if(mark==='ears' || mark==='cucumber')continue;
          g.line(sx,sy,sx-1+wave(i),sy+sign*(reach*.6+wave(i)),mark==='tufts'?light:c.a);
        }
      }
      if(mark==='ears'||mark==='ruffle'||mark==='feet')for(const k of [0,4])g.line(x+w-3-k,y-3,x+w+k,y-7-frame,c.a);
      break;
    }
  }
  return g.outline(.78,true);
}
