'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');

test('公開範例只包含程式繪製的 SVG，不包含私人照片',()=>{
  const file=path.join(root,'demo-image.js');
  assert.ok(fs.existsSync(file),'尚未提供可公開的幾何範例');
  const context={window:{}};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
  const demo=context.window.DEMO_IMAGE;
  assert.equal(demo.provenance,'procedural-svg');
  assert.match(demo.src,/^data:image\/svg\+xml/);
  const svg=decodeURIComponent(demo.src.split(',').slice(1).join(','));
  assert.match(svg,/<svg\s/);
  assert.doesNotMatch(svg,/<image\b|<script\b|(?:href|src)\s*=\s*["'](?:https?:)?\/\/|url\(\s*["']?https?:/i);
  assert.ok(demo.name.length>0);
});

test('Windows 啟動器在含中文與空格路徑下產生正確 file URI',{skip:process.platform!=='win32'},()=>{
  const launcher=path.join(root,'start_player.cmd');
  assert.ok(fs.existsSync(launcher),'尚未提供 Windows 獨立視窗啟動器');
  const fixture=path.join(root,'.test-tmp','中文 空格');
  fs.mkdirSync(fixture,{recursive:true});
  fs.copyFileSync(launcher,path.join(fixture,'start_player.cmd'));
  fs.copyFileSync(path.join(root,'index.html'),path.join(fixture,'index.html'));
  const output=require('node:child_process').execFileSync('cmd.exe',['/d','/c','start_player.cmd','--print-url'],{cwd:fixture,encoding:'utf8',timeout:20000,windowsHide:true}).trim();
  assert.equal(output,require('node:url').pathToFileURL(path.join(fixture,'index.html')).href);
});
