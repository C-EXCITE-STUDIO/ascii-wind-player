/* 檔案只經由 File/Blob 與 Canvas 在本機記憶體處理。 */
(function () {
  'use strict';
  const $=id=>document.getElementById(id);
  const ui=Object.fromEntries(['canvas','stage','choose','file-input','fps','status','clock','filename','image-info','play','restart','density','density-value','wind','wind-value','quality','glyph-count','emit-count','fullscreen','error','drop-hint'].map(id=>[id,$(id)]));
  const state={time:0,playing:!matchMedia('(prefers-reduced-motion: reduce)').matches,density:.5,wind:1,seed:17,image:null,model:null,name:'',fps:0,loadMs:0,loadSequence:0};
  const errors=[],violations=[];let renderer,last=performance.now(),fpsStart=last,fpsFrames=0,dragDepth=0;
  addEventListener('error',event=>errors.push(String(event.message)));
  addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
  addEventListener('securitypolicyviolation',event=>violations.push(event.violatedDirective+': '+event.blockedURI));
  function showError(message){ui.error.textContent=message;ui.error.hidden=false;}
  function clearError(){ui.error.hidden=true;ui.error.textContent='';}
  function updateMetrics(){
    if(!state.model) return;
    ui['glyph-count'].textContent=state.model.count.toLocaleString();
    ui['emit-count'].textContent=renderer.enabledCount.toLocaleString();
    ui.clock.textContent=`${(state.time%8).toFixed(2).padStart(5,'0')} / 08.00`;
  }
  function draw(){if(renderer&&state.model){renderer.render(state.time,state.wind);updateMetrics();}}
  function setPlaying(playing){
    state.playing=Boolean(playing);last=performance.now();fpsStart=last;fpsFrames=0;
    ui.play.textContent=state.playing?'暫停':'繼續播放';
    ui.play.setAttribute('aria-label',state.playing?'暫停播放':'繼續播放');
    ui.play.setAttribute('aria-pressed',String(!state.playing));
    if(!state.playing) {ui.fps.textContent='已暫停 / GPU';draw();}
    else ui.fps.textContent='播放中 / GPU';
  }
  function rebuild(image,name){
    const started=performance.now();
    const geo=AsciiCore.geometry(image.naturalWidth,image.naturalHeight,Number(ui.quality.value));
    const sample=document.createElement('canvas');sample.width=geo.cols;sample.height=geo.rows;
    const ctx=sample.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingQuality='high';
    ctx.drawImage(image,0,0,geo.cols,geo.rows);
    const model=AsciiCore.buildModel(ctx.getImageData(0,0,geo.cols,geo.rows).data,geo,state.seed);
    renderer.setModel(model,state.density);
    state.image=image;state.name=name;state.model=model;state.time=0;state.loadMs=performance.now()-started;
    ui.filename.textContent=name;ui.filename.title=name;
    ui['image-info'].textContent=`${image.naturalWidth} × ${image.naturalHeight} / 本機圖片`;
    ui.status.textContent='選圖或拖入圖片 · 即時 GPU 運算';
    clearError();draw();last=performance.now();fpsStart=last;fpsFrames=0;
  }
  async function loadURL(src,name){
    const sequence=++state.loadSequence;
    const image=new Image();image.decoding='async';image.src=src;
    await image.decode();
    if(sequence!==state.loadSequence) return false;
    if(image.naturalWidth*image.naturalHeight>100000000) throw new Error('圖片像素過大，請先縮小至一億像素以下。');
    rebuild(image,name);return true;
  }
  async function loadFile(file){
    if(!file) return false;
    if(file.type && !file.type.startsWith('image/')) {showError('請選擇圖片檔案，例如 PNG、JPG 或 WebP。');return false;}
    if(file.size>64*1024*1024) {showError('圖片檔案超過 64 MB，請先縮小後再試。');return false;}
    ui.status.textContent='正在取樣圖片與建立字符…';
    const url=URL.createObjectURL(file);
    try {return await loadURL(url,file.name);}
    catch(error){showError('無法讀取這張圖片：'+error.message);ui.status.textContent=state.model?'保留上一張圖片，請重新選擇。':'請選擇一張可讀取的圖片。';return false;}
    finally {URL.revokeObjectURL(url);}
  }
  function setDensity(value){
    state.density=Math.max(0,Math.min(1,Number(value)));
    ui.density.value=Math.round(state.density*100);ui['density-value'].textContent=`${Math.round(state.density*100)}%`;
    if(renderer&&state.model){renderer.setDensity(state.density);draw();}
  }
  function setWind(value){
    state.wind=Math.max(.25,Math.min(2,Number(value)));ui.wind.value=Math.round(state.wind*100);
    ui['wind-value'].textContent=state.wind.toFixed(2)+'×';draw();
  }
  async function fullscreen(){
    try {if(document.fullscreenElement) await document.exitFullscreen();else await ui.stage.requestFullscreen();}
    catch(error){showError('目前無法進入全螢幕：'+error.message);}
  }
  ui.choose.addEventListener('click',()=>ui['file-input'].click());
  ui['file-input'].addEventListener('change',async event=>{const file=event.target.files[0];await loadFile(file);event.target.value='';});
  ui.play.addEventListener('click',()=>setPlaying(!state.playing));
  ui.restart.addEventListener('click',()=>{state.time=0;last=performance.now();draw();});
  ui.density.addEventListener('input',()=>setDensity(Number(ui.density.value)/100));
  ui.wind.addEventListener('input',()=>setWind(Number(ui.wind.value)/100));
  ui.quality.addEventListener('change',()=>{if(state.image){try{rebuild(state.image,state.name);}catch(error){showError(error.message);}}});
  ui.fullscreen.addEventListener('click',fullscreen);
  document.addEventListener('fullscreenchange',()=>{ui.fullscreen.innerHTML=document.fullscreenElement?'離開全螢幕 <span aria-hidden="true">↙</span>':'全螢幕播放 <span aria-hidden="true">↗</span>';draw();});
  ui.stage.addEventListener('dragenter',event=>{event.preventDefault();dragDepth++;ui['drop-hint'].hidden=false;});
  ui.stage.addEventListener('dragover',event=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='copy';});
  ui.stage.addEventListener('dragleave',event=>{event.preventDefault();if(--dragDepth<=0){dragDepth=0;ui['drop-hint'].hidden=true;}});
  ui.stage.addEventListener('drop',async event=>{event.preventDefault();dragDepth=0;ui['drop-hint'].hidden=true;await loadFile(event.dataTransfer.files[0]);});
  addEventListener('dragover',event=>event.preventDefault());addEventListener('drop',event=>event.preventDefault());
  addEventListener('keydown',event=>{
    if(event.ctrlKey||event.metaKey||event.altKey||event.target.closest('input,select,button,a'))return;
    if(event.code==='Space'){event.preventDefault();setPlaying(!state.playing);}
    else if(event.code==='KeyR'){state.time=0;draw();}
    else if(event.code==='KeyF')fullscreen();
    else if(event.code==='KeyO')ui['file-input'].click();
  });
  ui.canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();setPlaying(false);showError('GPU 繪圖環境已中斷，請重新整理視窗後再選擇圖片。');});
  try {renderer=new GlyphRenderer(ui.canvas);}
  catch(error){showError(error.message);ui.status.textContent='無法啟動 GPU，請檢查瀏覽器硬體加速設定。';ui.choose.disabled=true;return;}
  new ResizeObserver(()=>draw()).observe(ui.stage);
  setPlaying(state.playing);
  function animate(now){
    const delta=Math.max(0,Math.min((now-last)/1000,.05));last=now;
    if(state.model&&state.playing&&!document.hidden){
      state.time+=delta;draw();fpsFrames++;
      if(now-fpsStart>=1000){state.fps=fpsFrames*1000/(now-fpsStart);ui.fps.textContent=`${state.fps.toFixed(0)} FPS / GPU`;fpsStart=now;fpsFrames=0;}
    } else {fpsStart=now;fpsFrames=0;}
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
  window.player={
    loadFile,setDensity,setWind,setPlaying,
    renderAt(time){setPlaying(false);state.time=Number(time);draw();},
    getState(){return {ready:!!state.model,playing:state.playing,time:state.time,cycleTime:state.time%8,density:state.density,wind:state.wind,
      filename:state.name,imageWidth:state.image?.naturalWidth,imageHeight:state.image?.naturalHeight,
      glyphs:state.model?.count||0,detachmentPoints:renderer.enabledCount||0,frames:renderer.frames,fps:state.fps,
      quality:Number(ui.quality.value),loadMs:state.loadMs,gpu:renderer.device,glError:renderer.gl.getError(),
      errors:[...errors],cspViolations:[...violations],lastError:ui.error.hidden?null:ui.error.textContent};},
    pixelSummary(){return renderer.pixelSummary();},
    getModel(){return state.model;}
  };
  document.fonts.ready.then(()=>{
    if(window.DEMO_IMAGE)return loadURL(DEMO_IMAGE.src,DEMO_IMAGE.name);
    throw new Error('本機範例不存在，請選擇自己的圖片。');
  }).catch(error=>showError(error.message));
})();
