"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import AppNav from "./AppNav";

export type IntroHeroSettings = {
  heading?: string;
  /** CSS pixels per cell when the shorter screen edge equals referenceSize. */
  gridPitch?: number;
  referenceSize?: number;
  noiseScale?: number;
  /** Simplex values that split the field into L, U, and V. */
  shapeThresholds?: [number, number];
  /** Grayscale brightness range, 0–1. */
  brightness?: [number, number];
  /** Field evolution rate. Lower is slower. */
  speed?: number;
};

const TITLE_GOLD = "#D6AD4F";
const TITLE_CHARS = new Set(["L", "U", "V"]);
const PRESENTATION_BOARD_HREF = "/composition-presentation?presentationBoard=7407x2160";

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSquared = abx * abx + aby * aby || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lengthSquared));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}
const DEFAULT_THRESHOLDS: [number, number] = [-0.16, 0.2];
const DEFAULT_BRIGHTNESS: [number, number] = [0.18, 0.92];

const VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uResolution;
uniform float uPitch;
uniform float uTime;
uniform float uNoiseScale;
uniform vec2 uThresholds;
uniform vec2 uBrightness;
uniform float uRadius;
uniform vec2 uTrail[128];
uniform float uTrailRot[128];
uniform float uTrailLife[128];

vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=1.0/7.0;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}

float letterL(vec2 uv){
  float stem=step(0.16,uv.x)*step(uv.x,0.42)*step(0.14,uv.y)*step(uv.y,0.86);
  float foot=step(0.16,uv.x)*step(uv.x,0.84)*step(0.58,uv.y)*step(uv.y,0.86);
  return max(stem,foot);
}
float letterU(vec2 uv){
  float left=step(0.16,uv.x)*step(uv.x,0.40)*step(0.28,uv.y)*step(uv.y,0.86);
  float right=step(0.60,uv.x)*step(uv.x,0.84)*step(0.28,uv.y)*step(uv.y,0.86);
  float base=step(0.16,uv.x)*step(uv.x,0.84)*step(0.14,uv.y)*step(uv.y,0.42);
  return max(max(left,right),base);
}
float ripple(vec2 offset, float life){
  float dist=length(offset);
  float band=max(uRadius*0.16,1.0);
  float ringRadius=max(uRadius*2.0-uPitch*2.0,uRadius+band*1.5);
  float core=life*(1.0-smoothstep(0.0,uRadius,dist));
  float ring=life*0.62*exp(-pow((dist-ringRadius)/band,2.0));
  return max(core,ring);
}
float letterV(vec2 uv){
  float t=clamp((uv.y-0.14)/0.72,0.0,1.0);
  float arm=mix(0.03,0.34,t);
  float thick=mix(0.11,0.13,t);
  float band=step(abs(abs(uv.x-0.5)-arm),thick);
  float gate=step(0.14,uv.y)*step(uv.y,0.88);
  return band*gate;
}

void main(){
  vec2 px=gl_FragCoord.xy;
  vec2 cell=floor(px/uPitch);
  vec2 local=fract(px/uPitch);
  vec2 field=(cell+0.5)/max(uResolution/uPitch,vec2(1.0));
  float shapeNoise=snoise(vec3(field*uNoiseScale,uTime));
  float shadeNoise=snoise(vec3(field*uNoiseScale*0.82+vec2(9.0,4.0),uTime*0.72));
  float spinNoise=snoise(vec3(field*uNoiseScale*0.55+vec2(8.0,5.0),uTime*0.22));
  float noiseRot=floor(spinNoise*4.0+0.5)*0.78539816;
  vec2 center=(cell+0.5)*uPitch;
  float influence=0.0;
  float rotZ=noiseRot;
  float best=0.2;
  for(int i=0;i<127;i++){
    float life=uTrailLife[i];
    if(life<=0.0) continue;
    vec2 ab=uTrail[i+1]-uTrail[i];
    float along=dot(ab,ab);
    float weight=ripple(center-uTrail[i],life);
    if(uTrailLife[i+1]>0.0 && along<uRadius*uRadius*4.8){
      float t=clamp(dot(center-uTrail[i],ab)/max(along,0.0001),0.0,1.0);
      weight=max(weight,ripple(center-(uTrail[i]+ab*t),life));
    }
    influence=1.0-(1.0-influence)*(1.0-weight);
    if(weight>best){
      best=weight;
      rotZ=uTrailRot[i];
    }
  }
  if(uTrailLife[127]>0.0){
    float weight=ripple(center-uTrail[127],uTrailLife[127]);
    influence=1.0-(1.0-influence)*(1.0-weight);
    if(weight>best) rotZ=uTrailRot[127];
  }
  vec2 p=local-0.5;
  float cz=cos(rotZ);
  float sz=sin(rotZ);
  vec2 sampleUv=vec2(p.x*cz+p.y*sz,-p.x*sz+p.y*cz)+0.5;
  float glyph=0.0;
  if(sampleUv.x>=0.0 && sampleUv.x<=1.0 && sampleUv.y>=0.0 && sampleUv.y<=1.0){
    glyph=letterL(sampleUv);
    if(shapeNoise>=uThresholds.x) glyph=letterU(sampleUv);
    if(shapeNoise>=uThresholds.y) glyph=letterV(sampleUv);
  }
  float shade=mix(uBrightness.x,uBrightness.y,shadeNoise*0.5+0.5);
  float opacity=mix(0.42,1.0,shade);
  vec3 glyphColor=vec3(shade)*opacity;
  fragColor=vec4(mix(vec3(0.0),glyphColor,glyph),1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create the intro shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "Shader compile failed.";
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

export default function IntroHero({
  heading = "LUV",
  gridPitch = 10,
  referenceSize = 1000,
  noiseScale = 3.1,
  shapeThresholds = DEFAULT_THRESHOLDS,
  brightness = DEFAULT_BRIGHTNESS,
  speed = 0.12,
}: IntroHeroSettings) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const titleRef = useRef<HTMLCanvasElement>(null);
  const ribbonRef = useRef<HTMLDivElement>(null);
  const presentationRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, premultipliedAlpha: false });
    if (!gl) return;

    const vertex = compile(gl, gl.VERTEX_SHADER, VERT);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? "Intro shader link failed.");
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const resolution = gl.getUniformLocation(program, "uResolution");
    const pitch = gl.getUniformLocation(program, "uPitch");
    const time = gl.getUniformLocation(program, "uTime");
    const scale = gl.getUniformLocation(program, "uNoiseScale");
    const thresholds = gl.getUniformLocation(program, "uThresholds");
    const brightnessLoc = gl.getUniformLocation(program, "uBrightness");
    const radiusLoc = gl.getUniformLocation(program, "uRadius");
    const trailLoc = gl.getUniformLocation(program, "uTrail[0]");
    const trailRotLoc = gl.getUniformLocation(program, "uTrailRot[0]");
    const trailLifeLoc = gl.getUniformLocation(program, "uTrailLife[0]");
    const trailLimit = 128;
    const trailDuration = 1;
    const trailX = new Float32Array(trailLimit * 2);
    const trailRot = new Float32Array(trailLimit);
    const trailLife = new Float32Array(trailLimit);
    const trailBorn = new Float64Array(trailLimit);
    let trailCount = 0;
    let pointerRot = 0;
    let sinceStep = 0;
    const rotationStep = Math.PI / 4;
    const pushTrail = (x: number, y: number, rot: number, born: number) => {
      const writeAt = (index: number) => {
        trailX[index * 2] = x;
        trailX[index * 2 + 1] = y;
        trailRot[index] = rot;
        trailLife[index] = 1;
        trailBorn[index] = born;
      };
      if (trailCount < trailLimit) {
        writeAt(trailCount);
        trailCount += 1;
        return;
      }
      trailX.copyWithin(0, 2);
      trailRot.copyWithin(0, 1);
      trailLife.copyWithin(0, 1);
      trailBorn.copyWithin(0, 1);
      writeAt(trailLimit - 1);
    };
    const onPointerMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      const nextX = (event.clientX - bounds.left) * (canvas.width / Math.max(1, bounds.width));
      const nextY = canvas.height - (event.clientY - bounds.top) * (canvas.height / Math.max(1, bounds.height));
      const radius = Math.min(canvas.width, canvas.height) * 0.028;
      const spacing = Math.max(radius * 0.18, 3);
      const head = trailCount - 1;
      const dx = head < 0 ? 0 : nextX - trailX[head * 2];
      const dy = head < 0 ? 0 : nextY - trailX[head * 2 + 1];
      if (head < 0 || dx * dx + dy * dy > spacing * spacing) {
        sinceStep += Math.hypot(dx, dy);
        if (trailCount > 0 && sinceStep >= radius * 0.75) {
          pointerRot -= rotationStep;
          sinceStep = 0;
        }
        pushTrail(nextX, nextY, pointerRot, performance.now());
      }
    };
    canvas.parentElement?.addEventListener("pointermove", onPointerMove);

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = motion.matches;
    let frame = 0;
    let elapsed = 0;
    let last = performance.now();
    let running = true;

    const paintTitle = () => {
      const title = titleRef.current;
      if (!title) return () => {};
      title.width = canvas.width;
      title.height = canvas.height;
      const ctx = title.getContext("2d");
      if (!ctx) return () => {};
      ctx.clearRect(0, 0, title.width, title.height);
      const cssWidth = canvas.clientWidth || window.innerWidth;
      const cssHeight = canvas.clientHeight || window.innerHeight;
      const dpr = canvas.width / Math.max(1, cssWidth);
      const pitch = Math.max(2, Math.round(gridPitch * (Math.min(cssWidth, cssHeight) / referenceSize) * dpr));
      const chars = [...heading.toUpperCase()].filter(char => TITLE_CHARS.has(char));
      if (!chars.length) return () => {};
      const rowsFromHeight = title.height * 0.46 / pitch;
      const rowsFromWidth = title.width * 0.88 / pitch / (chars.length * 0.72 + (chars.length - 1) * 0.2);
      const rows = Math.max(11, Math.round(Math.min(rowsFromHeight, rowsFromWidth)));
      const stroke = Math.max(1, Math.round(rows / 11));
      let cols = Math.max(stroke * 3 + 2, Math.round(rows * 0.72));
      if (cols % 2 === 0) cols += 1;
      const gap = Math.max(stroke, Math.round(rows * 0.2));
      const wordCols = chars.length * cols + (chars.length - 1) * gap;
      const originCol = Math.round((title.width / pitch - wordCols) / 2);
      const originRow = Math.round((title.height / pitch - rows) / 2);
      const half = stroke / 2;
      const mid = (cols - 1) / 2;
      const vBody = (col: number, row: number) => {
        const x = Math.min(col, cols - 1 - col) + 0.5;
        const y = row + 0.5;
        return distanceToSegment(x, y, half, half, mid + 0.5, rows - half) <= half;
      };
      const flatCap = (side: "left" | "right") => {
        const onSide = (col: number) => side === "left" ? col <= mid : col >= mid;
        let top = rows;
        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < cols; col += 1) if (onSide(col) && vBody(col, row)) top = Math.min(top, row);
        }
        const atTop: number[] = [];
        for (let col = 0; col < cols; col += 1) if (onSide(col) && vBody(col, top)) atTop.push(col);
        if (!atTop.length) return { top: -1, lo: 0, hi: -1 };
        let lo = Math.max(side === "left" ? 0 : Math.ceil(mid), Math.min(...atTop) - 2);
        let hi = Math.min(side === "left" ? Math.floor(mid) : cols - 1, Math.max(...atTop) + 2);
        const supported = (col: number) => top + 1 < rows && vBody(col, top + 1);
        if (lo < hi && !supported(lo) && !atTop.includes(lo)) lo += 1;
        if (lo < hi && !supported(hi) && !atTop.includes(hi)) hi -= 1;
        return { top, lo, hi };
      };
      const leftCap = flatCap("left");
      const rightCap = flatCap("right");
      const covers = (char: string, col: number, row: number) => {
        if (col < 0 || row < 0 || col >= cols || row >= rows) return false;
        const fromBottom = rows - 1 - row;
        if (char === "L") {
          if (stroke > 1 && col === 0 && fromBottom < 2) return false;
          return col < stroke || row >= rows - stroke;
        }
        if (char === "U") {
          const steps = Math.min(Math.max(0, stroke - 1), fromBottom >= 4 ? 0 : fromBottom >= 2 ? 1 : 2);
          if (col < steps || col >= cols - steps) return false;
          return col < stroke || col >= cols - stroke || row >= rows - stroke;
        }
        if (vBody(col, row)) return true;
        return (row === leftCap.top && col >= leftCap.lo && col <= leftCap.hi)
          || (row === rightCap.top && col >= rightCap.lo && col <= rightCap.hi);
      };
      ctx.clearRect(0, 0, title.width, title.height);
      ctx.fillStyle = TITLE_GOLD;
      chars.forEach((char, index) => {
        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < cols; col += 1) {
            if (!covers(char, col, row)) continue;
            const gridCol = originCol + index * (cols + gap) + col;
            const gridRow = originRow + row;
            const x0 = Math.floor(gridCol * pitch);
            const y0 = Math.floor(gridRow * pitch);
            const x1 = Math.floor((gridCol + 1) * pitch);
            const y1 = Math.floor((gridRow + 1) * pitch);
            ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
          }
        }
      });
      const presentation = presentationRef.current;
      const uIndex = chars.indexOf("U");
      if (presentation && uIndex >= 0) {
        const letterHeight = rows * pitch / dpr;
        const centerX = (originCol + uIndex * (cols + gap) + cols / 2) * pitch / dpr;
        const bottomY = (originRow + rows) * pitch / dpr;
        presentation.style.left = `${centerX}px`;
        presentation.style.top = `${bottomY + Math.max(16, letterHeight * 0.14)}px`;
        presentation.style.fontSize = `${Math.max(13, Math.min(22, letterHeight * 0.07))}px`;
      }
      return () => {};
    };
    let clearTitlePointer = () => {};

    const resize = () => {
      const cssWidth = canvas.clientWidth || window.innerWidth;
      const cssHeight = canvas.clientHeight || window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(cssWidth * dpr));
      canvas.height = Math.max(1, Math.round(cssHeight * dpr));
      clearTitlePointer();
      clearTitlePointer = paintTitle();
      const scale = Math.min(cssWidth, cssHeight) / referenceSize;
      if (ribbonRef.current) ribbonRef.current.style.height = `${Math.max(40, Math.round(44 * scale))}px`;
    };

    const draw = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduced) elapsed += dt * speed;
      const cssWidth = canvas.clientWidth || window.innerWidth;
      const cssHeight = canvas.clientHeight || window.innerHeight;
      const dpr = canvas.width / Math.max(1, cssWidth);
      const cell = Math.max(2, Math.round(gridPitch * (Math.min(cssWidth, cssHeight) / referenceSize) * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program);
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform1f(pitch, cell);
      gl.uniform1f(time, elapsed);
      gl.uniform1f(scale, noiseScale);
      gl.uniform2f(thresholds, shapeThresholds[0], shapeThresholds[1]);
      let write = 0;
      for (let index = 0; index < trailCount; index += 1) {
        if ((now - trailBorn[index]) / 1000 >= trailDuration) continue;
        trailX[write * 2] = trailX[index * 2];
        trailX[write * 2 + 1] = trailX[index * 2 + 1];
        trailRot[write] = trailRot[index];
        trailBorn[write] = trailBorn[index];
        trailLife[write] = 1;
        write += 1;
      }
      for (let index = write; index < trailLimit; index += 1) trailLife[index] = 0;
      trailCount = write;
      gl.uniform2f(brightnessLoc, brightness[0], brightness[1]);
      gl.uniform1f(radiusLoc, Math.min(canvas.width, canvas.height) * 0.028);
      gl.uniform2fv(trailLoc, trailX);
      gl.uniform1fv(trailRotLoc, trailRot);
      gl.uniform1fv(trailLifeLoc, trailLife);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      frame = requestAnimationFrame(draw);
    };

    const onMotion = () => { reduced = motion.matches; };
    resize();
    frame = requestAnimationFrame(draw);
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    motion.addEventListener("change", onMotion);

    return () => {
      running = false;
      clearTitlePointer();
      cancelAnimationFrame(frame);
      observer.disconnect();
      motion.removeEventListener("change", onMotion);
      canvas.parentElement?.removeEventListener("pointermove", onPointerMove);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    };
  }, [brightness, gridPitch, heading, noiseScale, referenceSize, shapeThresholds, speed]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-black">
      <h1 className="sr-only">{heading}</h1>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      <canvas ref={titleRef} className="pointer-events-none absolute inset-0 z-[1] h-full w-full" aria-hidden="true" />
      <Link
        ref={presentationRef}
        href={PRESENTATION_BOARD_HREF}
        className="absolute z-[2] -translate-x-1/2 whitespace-nowrap rounded-full border border-[#D6AD4F] bg-black/80 px-7 py-2 font-medium tracking-[0.14em] text-[#D6AD4F] uppercase hover:border-white hover:text-white focus-visible:border-white focus-visible:text-white active:border-white active:text-white"
        style={{ left: "50%", top: "64%" }}
      >
        Presentation
      </Link>
      <div ref={ribbonRef} className="absolute inset-x-0 top-0 z-10 flex items-center overflow-x-auto bg-black px-4" style={{ backgroundColor: "#000000", height: 44 }}>
        <AppNav />
      </div>
    </main>
  );
}
