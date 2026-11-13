import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newAdventure, newSave, portDestinations, startPort, getPort, PortNavigation, lineFree, isLand, predatorForShadow, isPredatorSpecies, SPECIES, SPECIES_BY_ID, spawnShadows, speciesForShadow, Rng, type Pt } from '../packages/shared/src/index';

const seed = 20261111;

test('navigation : destinations dédupliquées, contrats actuels et chat du joueur', () => {
  const s = newSave(seed, 0);
  s.lastPort = '1:2'; s.cat = {port:'-2:1',at:0,sequence:0};
  s.adventure = newAdventure();
  s.adventure.active = [
    {id:'a',port:'1:2',day:'1970-01-01',kind:'photo',label:'a',goal:1,reward:1,rep:1,progress:0,baseline:0,acceptedAt:0},
    {id:'b',port:'2:3',day:'1970-01-01',kind:'photo',label:'b',goal:1,reward:1,rep:1,progress:0,baseline:0,acceptedAt:0},
    {id:'old',port:'5:5',day:'1969-12-31',kind:'photo',label:'old',goal:1,reward:1,rep:1,progress:0,baseline:0,acceptedAt:0},
  ];
  const d = portDestinations(s,seed,0);
  assert.equal(d.length,4);
  assert.deepEqual(d[0].reasons,['Dernier port visité','Contrat en cours']);
  assert.equal(d[1].port.id,'0:0'); assert.equal(d[2].port.id,'2:3'); assert.equal(d[3].port.id,'-2:1');
  assert.ok(!d.some(v=>v.port.id==='5:5'));
  assert.deepEqual(d[3].reasons,['Chat pêcheur']);
});

test('navigation : poursuit les chemins partiels jusqu’au port en contournant une île', () => {
  const port = {...startPort(seed),x:100,y:0};
  const nav = new PortNavigation(port);
  const blocked = (x:number,y:number) => x>=30&&x<=60&&y>=-8&&y<=8;
  let position:Pt = {x:.5,y:.5},legs=0;
  while(!nav.arrived(position) && legs<100){
    const path = nav.plan(blocked,position,250);
    assert.ok(path?.length,'un cap supplémentaire est tracé');
    for(const p of path!){assert.ok(lineFree(blocked,position,p));position=p;}
    legs++;
  }
  assert.ok(nav.arrived(position));assert.ok(legs>1,'recherche bornée : plusieurs caps automatiques');
  assert.deepEqual(nav.plan(blocked,position),[]);
  assert.equal(new PortNavigation(port).plan(()=>true,{x:0,y:0}),null);
});

test('navigation : les routes du monde rejoignent les quais par la mer', () => {
  const origin=startPort(seed),blocked=(x:number,y:number)=>isLand(seed,x,y)||isLand(seed,x+1,y)||isLand(seed,x-1,y)||isLand(seed,x,y+1)||isLand(seed,x,y-1);
  for(const [cx,cy] of [[1,0],[-1,1],[2,-2]]){
    const nav=new PortNavigation(getPort(seed,cx,cy));let pos:Pt={x:origin.x+.5,y:origin.y+.5},n=0;
    while(!nav.arrived(pos)&&n++<30){const path=nav.plan(blocked,pos);assert.ok(path?.length);for(const p of path!){assert.ok(lineFree(blocked,pos,p));pos=p;}}
    assert.ok(nav.arrived(pos),`port ${cx}:${cy} atteint`);
  }
});

test('prédateurs : toutes les ombres de requins éligibles sont hostiles, sans filtre à 20 %', () => {
  for(let n=1;n<=100;n++)assert.ok(predatorForShadow({seed:n,sil:'shark',biome:'tropical',depth:.4}));
  for(const sp of SPECIES.filter(s=>s.shape==='shark'&&s.id!=='requin_baleine'))assert.ok(isPredatorSpecies(sp),sp.id);
  assert.equal(isPredatorSpecies(SPECIES_BY_ID.requin_baleine),false);
  assert.equal(isPredatorSpecies(SPECIES_BY_ID.calmar),false);
});

test('prédateurs : aucune espèce dangereuse ne se cache dans une ombre passive', () => {
  let hostile=0,passive=0;
  for(let cy=-10;cy<=10;cy++)for(let cx=-10;cx<=10;cx++)for(const sh of spawnShadows(seed,cx,cy,5980000)){
    const predator=predatorForShadow(sh),pick=speciesForShadow(new Rng(sh.seed),seed,sh);
    if(!pick)continue;
    assert.equal(!!predator,isPredatorSpecies(pick.sp),pick.sp.id);
    if(predator){hostile++;assert.equal(pick.sp.id,predator.id);}else passive++;
  }
  assert.ok(hostile>10);assert.ok(passive>hostile);
});


test('navigation : le bateau rejoint le quai et un cap manuel ou un arrêt annule le pilote', async () => {
  const {Game}=await import('../packages/client/src/game/game');
  const {setState}=await import('../packages/client/src/store');
  const s=newSave(seed,0);setState({save:s,result:null});
  const start=startPort(seed),land=(x:number,y:number)=>isLand(seed,x,y);
  const blocked=(x:number,y:number)=>land(x,y)||land(x+1,y)||land(x-1,y)||land(x,y+1)||land(x,y-1);
  const game=Object.create(Game.prototype) as any;
  Object.assign(game,{seed,terrain:{blocked,isLand:land},boat:{x:start.x+.5,y:start.y+.5,angle:Math.PI/2,speed:0,path:[],dest:null},fish:null,navigation:null,particles:[],sync:async()=>{}});
  const destination=getPort(seed,-1,1);
  assert.equal(game.goToPort(destination),true);
  for(let n=0;n<20000&&game.navigation;n++){game.updateBoat(.05);game.particles=[];}
  assert.equal(game.navigation,null);
  assert.ok(new PortNavigation(destination).arrived(game.boat),'arrivé au quai sans interruption par une collision');
  assert.equal(game.goToPort(start),true);
  assert.equal(game.goTo(game.boat.x,game.boat.y+1),true);
  assert.equal(game.navigation,null,'un cap manuel reprend la main');
  game.goToPort(start);game.cancelMove();assert.equal(game.navigation,null);assert.deepEqual(game.boat.path,[]);
  s.pendingCatch={uid:'pending',sp:'sardine',len:10,kg:.1,size:0,color:0,tough:false,lvl:1,value:10,at:0,biome:'coastal'};
  assert.equal(game.goToPort(start),false,'prise en attente : départ bloqué');
});
