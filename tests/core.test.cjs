'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
function core() {
  const file = path.join(__dirname, '..', 'core.js');
  assert.ok(fs.existsSync(file), '尚未實作即時播放器核心（預期 RED）');
  return require(file);
}
test('50% 密度的全域數量精確、局部配額均衡', () => {
  const events = Array.from({length: 253}, (_, i) => ({group: Math.floor(i / 64), start: ((i * 17) % 64) / 8, id: i}));
  const mask = core().densityMask(events, 0.5, 17);
  assert.equal(Array.from(mask).reduce((a,b) => a+b, 0), Math.round(events.length * 0.5));
  for (const group of new Set(events.map(e => e.group))) {
    const all = events.map((e,i) => [e,i]).filter(([e]) => e.group === group);
    const selected = all.filter(([,i]) => mask[i]).length;
    assert.ok(Math.abs(selected - all.length * 0.5) <= 0.5);
  }
});

test('同一字符離開、留空，再緩慢長回；保留原位與飛行不重複', () => {
  const api = core();
  assert.equal(typeof api.buildModel, 'function', '尚未建立圖片字符模型');
  const cols = 32, rows = 40, pixels = new Uint8ClampedArray(cols * rows * 4);
  for (let i=0; i<cols*rows; i++) pixels.set([160 + i%70, 90 + i%50, 140 + i%60, 255], i*4);
  const model = api.buildModel(pixels, {cols, rows, cw:5, ch:8, x0:100, y0:120}, 17);
  assert.ok(model.events.length > 500);
  const e = model.events[Math.floor(model.events.length / 2)];
  const birth = api.eventState(e, e.start, true);
  assert.equal(birth.sourceAlpha, 0);
  assert.equal(birth.flyingAlpha, 1);
  assert.equal(birth.x, e.x);
  assert.equal(birth.y, e.y);
  const flight = api.eventState(e, e.start + e.flight * 0.5, true);
  assert.ok(flight.x < e.x);
  assert.equal(flight.sourceAlpha, 0);
  const hold = api.eventState(e, e.start + e.flight + e.hold * 0.5, true);
  assert.equal(hold.sourceAlpha + hold.flyingAlpha, 0);
  const early = api.eventState(e, e.start + e.flight + e.hold + e.heal * 0.25, true);
  const late = api.eventState(e, e.start + e.flight + e.hold + e.heal * 0.75, true);
  assert.ok(early.sourceAlpha > 0 && early.sourceAlpha < late.sourceAlpha && late.sourceAlpha < 1);
  const fixed = api.eventState(e, e.start + 1, false);
  assert.equal(fixed.sourceAlpha, 1);
  assert.equal(fixed.flyingAlpha, 0);
  for (let t=0;t<8;t+=0.05) {
    const s = api.eventState(e,t,true);
    assert.ok(!(s.sourceAlpha > 0 && s.flyingAlpha > 0));
  }
});

test('密度 0 / 100%、種子與中間密度結果可重現', () => {
  const events=Array.from({length:1021},(_,i)=>({id:i,group:Math.floor(i/64),start:((i*19)%64)/8}));
  const api=core();
  assert.equal(api.densityMask(events,0).reduce((a,b)=>a+b,0),0);
  assert.equal(api.densityMask(events,1).reduce((a,b)=>a+b,0),events.length);
  assert.deepEqual(api.densityMask(events,.37,18),api.densityMask(events,.37,18));
  assert.equal(api.densityMask(events,.37,18).reduce((a,b)=>a+b,0),Math.round(events.length*.37));
});

test('不同寬高比都維持比例並容納於畫布內', () => {
  for(const [w,h] of [[1968,2464],[1920,1080],[1000,3000]]) {
    const g=core().geometry(w,h,5);
    assert.ok(g.cols>0 && g.rows>0 && g.x0>=0 && g.y0>=0);
    assert.ok(g.x0+g.cols*g.cw<=960 && g.y0+g.rows*g.ch<=1200);
    assert.ok(Math.abs((g.cols*g.cw)/(g.rows*g.ch)-w/h)<.04);
  }
});

test('拒絕無亮部、透明與資料長度錯誤，不以假畫面代替', () => {
  const geo={cols:8,rows:8,cw:5,ch:8,x0:100,y0:100};
  assert.throws(()=>core().buildModel(new Uint8Array(8),geo));
  assert.throws(()=>core().buildModel(new Uint8Array(8*8*4),geo),/亮部/);
  const transparent=new Uint8Array(8*8*4).fill(255);
  for(let i=3;i<transparent.length;i+=4)transparent[i]=0;
  assert.throws(()=>core().buildModel(transparent,geo),/亮部/);
});

test('來源字元唯一、色彩有界、全幅每處持續散落', () => {
  const geo={cols:48,rows:48,cw:5,ch:8,x0:100,y0:100};
  const pixels=new Uint8ClampedArray(48*48*4);
  for(let i=0;i<48*48;i++)pixels.set([150+i%100,80+i%90,110+i%80,255],i*4);
  const api=core(),model=api.buildModel(pixels,geo,17),mask=api.densityMask(model.events,.5,17);
  assert.equal(new Set(model.events.map(e=>e.id)).size,model.count);
  assert.ok(model.events.every(e=>e.color.every(x=>x>=0&&x<=1)&&e.glyph>0&&e.glyph<api.GLYPHS.length));
  const groups=new Map();model.events.forEach((e,i)=>{if(!groups.has(e.group))groups.set(e.group,[]);if(mask[i])groups.get(e.group).push(e);});
  for(let t=0;t<8;t+=.25)for(const group of groups.values())if(group.length>=20)
    assert.ok(group.some(e=>api.eventState(e,t,true).flyingAlpha>.15));
  for(const e of model.events.slice(0,10)) {
    const a=api.eventState(e,1.25,true),b=api.eventState(e,9.25,true);
    assert.ok(Math.abs(a.x-b.x)<1e-8 && Math.abs(a.sourceAlpha-b.sourceAlpha)<1e-8);
  }
});
