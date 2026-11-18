/* 每個來源字元只畫一個 point sprite；生命週期在 GPU 上計算。 */
(function (root) {
  'use strict';
  const VERTEX = `#version 300 es
  precision highp float;
  layout(location=0) in vec2 aOrigin;
  layout(location=1) in vec3 aColor;
  layout(location=2) in vec4 aTiming;
  layout(location=3) in vec3 aMotion;
  layout(location=4) in float aEnabled;
  uniform vec2 uResolution;
  uniform vec2 uOffset;
  uniform vec2 uGlyph;
  uniform float uScale;
  uniform float uTime;
  uniform float uWind;
  out vec3 vColor;
  out float vAlpha;
  flat out float vGlyph;
  flat out float vMoving;
  void main() {
    float age=mod(uTime-aTiming.x+8.0,8.0);
    float p=clamp(age/aTiming.y,0.0,1.0);
    float flying=pow(max(0.0,1.0-p*p*(3.0-2.0*p)),0.65);
    float q=clamp((age-aTiming.y-aTiming.z)/aTiming.w,0.0,1.0);
    float source=q*q*(3.0-2.0*q);
    vec2 position=aOrigin;
    vMoving=0.0;
    vAlpha=1.0;
    if (aEnabled>0.5) {
      if (age<aTiming.y) {
        float effective=age+0.32*(exp(-age/0.32)-1.0);
        position.x-=(aMotion.x*effective+8.0*age*age)*uWind;
        position.y+=(15.0*effective*sin(aMotion.y+age*1.8)+8.0*pow(age,1.3)*sin(aMotion.y))*uWind;
        vAlpha=flying;vMoving=1.0;
      } else { vAlpha=source; }
    }
    vec2 screen=(position+uGlyph*0.5)*uScale+uOffset;
    gl_Position=vec4((screen/uResolution*2.0-1.0)*vec2(1.0,-1.0),0.0,1.0);
    if(vAlpha<0.001) gl_Position=vec4(3.0,3.0,0.0,1.0);
    gl_PointSize=max(1.0,uGlyph.y*uScale);
    vColor=aColor;vGlyph=aMotion.z;
  }`;
  const FRAGMENT = `#version 300 es
  precision highp float;
  uniform sampler2D uAtlas;
  uniform float uGlyphCount;
  uniform float uRatio;
  in vec3 vColor;
  in float vAlpha;
  flat in float vGlyph;
  flat in float vMoving;
  out vec4 outColor;
  float ink(vec2 uv) {
    if(any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0)))) return 0.0;
    return texture(uAtlas,vec2((vGlyph+uv.x)/uGlyphCount,uv.y)).a;
  }
  void main() {
    vec2 uv=vec2((gl_PointCoord.x-0.5)/uRatio+0.5,gl_PointCoord.y);
    float a=ink(uv);
    if(vMoving>0.5) {
      float halo=ink(uv+vec2(0.18,0.0))+ink(uv-vec2(0.18,0.0))+
                 ink(uv+vec2(0.0,0.12))+ink(uv-vec2(0.0,0.12));
      a+=halo*0.055;
    }
    a*=vAlpha;
    if(a<0.002) discard;
    outColor=vec4(vColor*a,a);
  }`;
  class GlyphRenderer {
    constructor(canvas) {
      this.canvas=canvas;
      const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,premultipliedAlpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
      if(!gl) throw new Error('此瀏覽器未提供 WebGL 2。請以 Chrome／Edge 開啟並啟用硬體加速。');
      this.gl=gl;this.frames=0;
      const shader=(type,source)=>{
        const item=gl.createShader(type);gl.shaderSource(item,source);gl.compileShader(item);
        if(!gl.getShaderParameter(item,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(item));
        return item;
      };
      this.program=gl.createProgram();
      const vs=shader(gl.VERTEX_SHADER,VERTEX),fs=shader(gl.FRAGMENT_SHADER,FRAGMENT);
      gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);
      if(!gl.getProgramParameter(this.program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
      gl.deleteShader(vs);gl.deleteShader(fs);
      this.buffer=gl.createBuffer();this.vao=gl.createVertexArray();this.texture=gl.createTexture();
      this.uniform={};
      ['uResolution','uOffset','uGlyph','uScale','uTime','uWind','uAtlas','uGlyphCount','uRatio'].forEach(name=>this.uniform[name]=gl.getUniformLocation(this.program,name));
      gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
      const attributes=[[0,2,0],[1,3,2],[2,4,5],[3,3,9],[4,1,12]];
      attributes.forEach(([location,size,offset])=>{gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,13*4,offset*4);});
      gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.disable(gl.DEPTH_TEST);gl.clearColor(0,0,0,1);
      const debug=gl.getExtension('WEBGL_debug_renderer_info');
      this.device=debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    }
    makeAtlas(geo) {
      const chars=AsciiCore.GLYPHS,{cw,ch}=geo,scale=4;
      const high=document.createElement('canvas');high.width=cw*chars.length*scale;high.height=ch*scale;
      const ctx=high.getContext('2d');ctx.font=`700 ${Math.round(ch*1.16)*scale}px Consolas, 'Courier New', monospace`;ctx.fillStyle='#fff';
      chars.split('').forEach((char,i)=>{
        if(char===' ') return;
        const m=ctx.measureText(char),w=m.actualBoundingBoxLeft+m.actualBoundingBoxRight,h=m.actualBoundingBoxAscent+m.actualBoundingBoxDescent;
        const x=i*cw*scale+(cw*scale-w)/2+m.actualBoundingBoxLeft;
        const y=(ch*scale-h)/2+m.actualBoundingBoxAscent;
        ctx.fillText(char,x,y);
      });
      const atlas=document.createElement('canvas');atlas.width=cw*chars.length;atlas.height=ch;
      const small=atlas.getContext('2d',{willReadFrequently:true});small.imageSmoothingQuality='high';small.drawImage(high,0,0,atlas.width,atlas.height);
      const pixels=small.getImageData(0,0,atlas.width,atlas.height);
      for(let i=0;i<pixels.data.length;i+=4) {
        const a=pixels.data[i+3];pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255;
        pixels.data[i+3]=a<6 ? 0 : Math.round(255*Math.pow(a/255,.52));
      }
      small.putImageData(pixels,0,0);
      const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,this.texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,atlas);
    }
    setModel(model,fraction) {
      this.model=model;this.makeAtlas(model.geo);
      this.data=new Float32Array(model.count*13);
      model.events.forEach((e,i)=>this.data.set([e.x,e.y,...e.color,e.start,e.flight,e.hold,e.heal,e.speed,e.phase,e.glyph,0],i*13));
      this.setDensity(fraction);
    }
    setDensity(fraction) {
      if(!this.model) return;
      this.enabled=AsciiCore.densityMask(this.model.events,fraction,this.model.seed);
      this.enabledCount=0;
      for(let i=0;i<this.model.count;i++) {this.data[i*13+12]=this.enabled[i];this.enabledCount+=this.enabled[i];}
      const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,this.data,gl.DYNAMIC_DRAW);
    }
    resize() {
      const rect=this.canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,1.5);
      const w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
      if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
      this.gl.viewport(0,0,w,h);this.scale=Math.min(w/960,h/1200);this.offset=[(w-960*this.scale)/2,(h-1200*this.scale)/2];
    }
    render(time,wind=1) {
      if(!this.model||this.gl.isContextLost()) return;
      this.resize();
      const gl=this.gl,u=this.uniform,g=this.model.geo;
      gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(this.program);gl.bindVertexArray(this.vao);
      gl.uniform2f(u.uResolution,this.canvas.width,this.canvas.height);gl.uniform2f(u.uOffset,...this.offset);
      gl.uniform2f(u.uGlyph,g.cw,g.ch);gl.uniform1f(u.uScale,this.scale);gl.uniform1f(u.uTime,((time%8)+8)%8);
      gl.uniform1f(u.uWind,wind);gl.uniform1f(u.uGlyphCount,AsciiCore.GLYPHS.length);gl.uniform1f(u.uRatio,g.cw/g.ch);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.uniform1i(u.uAtlas,0);
      gl.drawArrays(gl.POINTS,0,this.model.count);this.frames++;
    }
    pixelSummary() {
      const gl=this.gl,w=this.canvas.width,h=this.canvas.height,pixels=new Uint8Array(w*h*4);
      gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      let hash=2166136261,energy=0,lit=0;
      for(let i=0;i<pixels.length;i+=16) {const v=pixels[i]+pixels[i+1]+pixels[i+2];energy+=v;if(v>12)lit++;hash=Math.imul(hash^v,16777619)>>>0;}
      return {signature:hash,energy,lit,width:w,height:h,glError:gl.getError()};
    }
  }
  root.GlyphRenderer=GlyphRenderer;
})(window);
