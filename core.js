/* 本機運算核心：瀏覽器與 Node 共用，無第三方依賴。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AsciiCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function rng(seed) {
    let value = seed >>> 0;
    return function () {
      value += 0x6D2B79F5;
      let x = Math.imul(value ^ value >>> 15, 1 | value);
      x ^= x + Math.imul(x ^ x >>> 7, 61 | x);
      return ((x ^ x >>> 14) >>> 0) / 4294967296;
    };
  }
  function densityMask(events, fraction, seed = 17) {
    fraction = Math.max(0, Math.min(1, Number(fraction) || 0));
    const random = rng(seed + 5001), map = new Map();
    events.forEach((event, i) => {
      if (!map.has(event.group)) map.set(event.group, []);
      map.get(event.group).push(i);
    });
    const groups = [...map.values()].map(ids => ({ids, quota: Math.floor(ids.length * fraction),
      remainder: ids.length * fraction % 1, tie: random()}));
    let extra = Math.round(events.length * fraction) - groups.reduce((sum, g) => sum + g.quota, 0);
    [...groups].sort((a,b) => b.remainder - a.remainder || a.tie - b.tie)
      .forEach(group => { if (extra > 0) { group.quota++; extra--; } });
    const mask = new Uint8Array(events.length);
    for (const group of groups) {
      const ordered = group.ids.sort((a,b) => events[a].start - events[b].start);
      const size = ordered.length, amount = group.quota;
      const shift = Math.floor(random() * size);
      for (let i = 0; i < amount; i++) mask[ordered[(Math.floor((i + 0.5) * size / amount) + shift) % size]] = 1;
    }
    return mask;
  }
  const GLYPHS = ' .,:;i!+*ox%#@M';
  const clamp = (x, lo=0, hi=1) => Math.max(lo, Math.min(hi, x));
  function geometry(imageWidth, imageHeight, cellWidth = 5) {
    if (!(imageWidth > 0 && imageHeight > 0)) throw new Error('圖片尺寸不正確');
    const cw = clamp(Math.round(cellWidth),3,12), ch = Math.round(cw * 1.6);
    let cols = Math.floor(960 * 0.81 / cw), rows = Math.max(1,Math.round(cols * cw * imageHeight / imageWidth / ch));
    if (rows * ch > 1200 * 0.82) {
      rows = Math.floor(1200 * 0.82 / ch);
      cols = Math.max(1,Math.round(rows * ch * imageWidth / imageHeight / cw));
    }
    return {cols,rows,cw,ch,x0:Math.round(960 * 0.965) - cols*cw,y0:Math.round((1200-rows*ch)/2+10)};
  }
  function buildModel(pixels, geo, seed = 17) {
    const {cols,rows,cw,ch,x0,y0} = geo, size=cols*rows;
    if (pixels.length !== size*4) throw new Error('圖片取樣資料長度不正確');
    const luma = new Float64Array(size);
    for (let i=0;i<size;i++) luma[i]=(pixels[i*4]*0.2126+pixels[i*4+1]*0.7152+pixels[i*4+2]*0.0722)/255*pixels[i*4+3]/255;
    const sorted = Array.from(luma).sort((a,b)=>a-b);
    let low=sorted[Math.floor(size*.025)], high=sorted[Math.floor((size-1)*.985)];
    if (high-low < .08) {low=0;high=1;}
    const events=[], groups=new Map(), random=rng(seed+4001), wide=Math.ceil(cols/8);
    for (let row=0;row<rows;row++) for (let col=0;col<cols;col++) {
      const id=row*cols+col, u=(col+.5)/cols, v=(row+.5)/rows;
      const lum=Math.pow(clamp((luma[id]-low)/Math.max(.1,high-low)),.76)*clamp(u/.11)*Math.min(clamp(v/.028),clamp((1-v)/.03));
      const glyph=Math.floor(Math.pow(lum,.82)*(GLYPHS.length-1)+1e-6);
      if (!glyph) continue;
      const r=pixels[id*4]/255,g=pixels[id*4+1]/255,b=pixels[id*4+2]/255;
      const saturation=(Math.max(r,g,b)-Math.min(r,g,b))/Math.max(.01,r,g,b);
      const energy=175+80*Math.pow(lum,.4), whiteMix=Math.pow(clamp((lum-.47)/.37),.65);
      const cyan=[energy*.24,energy*.94,energy], white=[255,252,242], magenta=[255,18+42*lum,126+92*lum];
      const accent=r>b*1.025 ? clamp((r-g-.025)*10)*clamp((saturation-.12)*5) : 0;
      const color=cyan.map((c,i)=>clamp(((c*(1-whiteMix)+white[i]*whiteMix)*(1-accent)+magenta[i]*accent)/255));
      const group=Math.floor(row/8)*wide+Math.floor(col/8);
      const event={id,row,col,x:x0+col*cw,y:y0+row*ch,glyph,color,group,start:0};
      if (!groups.has(group)) groups.set(group,[]);
      groups.get(group).push(event);
      events.push(event);
    }
    if (!events.length) throw new Error('圖片沒有可辨識的亮部，請選擇明暗較清楚的圖片');
    for (const list of groups.values()) {
      const slots=Array.from({length:list.length},(_,i)=>i);
      for (let i=slots.length-1;i>0;i--) {const j=Math.floor(random()*(i+1));[slots[i],slots[j]]=[slots[j],slots[i]];}
      const offset=random()*8;
      list.forEach((e,i)=>{e.start=((slots[i]+.08+random()*.84)*8/list.length+offset)%8;});
    }
    for (const e of events) {
      e.flight=1.8+random()*.35;e.hold=.3+random()*.15;e.heal=1.2+random()*.35;
      e.speed=60+random()*105;e.phase=random()*Math.PI*2;
    }
    return {events,geo,seed,count:events.length,loop:8};
  }
  function eventState(e, time, enabled=true, wind=1) {
    const age=((time-e.start)%8+8)%8;
    if (!enabled) return {x:e.x,y:e.y,sourceAlpha:1,flyingAlpha:0,age};
    const p=clamp(age/e.flight), flyingAlpha=Math.pow(Math.max(0,1-p*p*(3-2*p)),.65);
    const q=clamp((age-e.flight-e.hold)/e.heal), sourceAlpha=q*q*(3-2*q);
    const effective=age+.32*Math.expm1(-age/.32);
    return {x:e.x-(e.speed*effective+8*age*age)*wind,
      y:e.y+(15*effective*Math.sin(e.phase+age*1.8)+8*Math.pow(age,1.3)*Math.sin(e.phase))*wind,
      sourceAlpha,flyingAlpha,age};
  }
  return {rng,densityMask,geometry,buildModel,eventState,GLYPHS};
});
