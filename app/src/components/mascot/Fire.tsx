import { useEffect, useRef, useState } from 'react';
import { Flame } from '@/lib/icons';

/**
 * A real-time flame for the streak moment, drawn by a small WebGL2 fragment shader.
 *
 * Three nested teardrops (red, orange, yellow), each bent by its own rising noise, so the layers
 * slide against each other the way a real flame does. Before it lights there is only an ember at
 * the base. On `lit` the flame springs up from that ember with a little overshoot and throws a
 * burst of sparks, then keeps a few embers drifting. The whole shape scales uniformly, so a small
 * flame is still a flame and never a squashed blob.
 *
 * `fill` is for tiny canvases (the streak dot): a bigger flame that is meant to be clipped.
 */
const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform float u_time;
uniform float u_size;   // 0 = only the ember, 1 = full flame (springs past 1 briefly)
uniform float u_ignite; // seconds since it lit, < 0 before
uniform float u_aspect; // width / height
uniform float u_zoom;   // > 1 draws a bigger flame for clipped, tiny canvases

float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash2(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), u.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
// positive inside a teardrop with a round belly of radius r and its tip at height H
float tear(vec2 q, float r, float H) {
  float h = q.y;
  float w = h < r ? sqrt(max(0.0, r * r - (h - r) * (h - r))) : r * pow(max(0.0, 1.0 - (h - r) / (H - r)), 1.2);
  // past the tip (or below the base) we're outside; without this a hairline runs up the middle
  return min(w - abs(q.x) - max(0.0, h - H), h);
}

void main() {
  float t = u_time;
  vec2 p = vec2((v_uv.x - 0.5) * u_aspect, v_uv.y - 0.07); // base of the flame at 7% height
  float s = max(u_size, 0.001);
  vec2 q = p / (s * u_zoom);

  // the whole flame leans with a slow draft, more towards the tip
  q.x -= (fbm(vec2(t * 0.5, 2.7)) - 0.5) * 0.4 * q.y * q.y;
  float n1 = fbm(vec2(q.x * 3.0, q.y * 2.2 - t * 1.9));
  float n2 = fbm(vec2(q.x * 4.4 + 5.0, q.y * 3.0 - t * 2.5));
  float n3 = fbm(vec2(q.x * 6.0 + 9.0, q.y * 3.8 - t * 3.2));

  float outer = tear(q + vec2((n1 - 0.5) * 0.3 * q.y, 0.0), 0.27, 0.78 + (n1 - 0.5) * 0.14);
  outer -= smoothstep(0.3, 0.8, q.y) * (n2 - 0.42) * 0.14; // tongues at the top
  float mid = tear(q + vec2((n2 - 0.5) * 0.26 * q.y, 0.0), 0.19, 0.56 + (n2 - 0.5) * 0.12);
  float core = tear(q + vec2((n3 - 0.5) * 0.16 * q.y, 0.0), 0.12, 0.36 + (n3 - 0.5) * 0.08);

  float aa = 0.014 / (s * u_zoom);
  float A = smoothstep(-aa, aa, outer);
  float B = smoothstep(-aa, aa, mid);
  float C = smoothstep(-aa, aa, core);

  vec3 red = vec3(0.90, 0.27, 0.08);
  vec3 orange = vec3(1.0, 0.54, 0.10);
  vec3 yellow = vec3(1.0, 0.80, 0.28);
  vec3 cream = vec3(1.0, 0.94, 0.74);
  vec3 col = mix(red, vec3(0.78, 0.18, 0.06), smoothstep(0.3, 0.8, q.y) * 0.45);
  col = mix(col, orange, B);
  col = mix(col, yellow, C);
  col = mix(col, cream, C * (1.0 - smoothstep(0.02, 0.2, q.y)) * 0.8);
  float a = A * smoothstep(0.0, 0.08, s);

  // warm glow hugging the flame, breathing slowly
  float glow = exp(-max(-outer, 0.0) * 12.0) * smoothstep(-0.06, 0.06, q.y) * (0.26 + 0.06 * sin(t * 3.0)) * smoothstep(0.1, 0.6, s);
  vec3 c = mix(orange, col, A);
  a = max(a, glow * (1.0 - A));

  // the ember: a small hot point at the base before (and while) the flame takes
  float ember = (1.0 - smoothstep(0.0, 0.5, s)) * (0.75 + 0.25 * sin(t * 7.0));
  float e = exp(-dot(p - vec2(0.0, 0.03), p - vec2(0.0, 0.03)) * 1400.0) * ember;
  float eg = exp(-dot(p - vec2(0.0, 0.03), p - vec2(0.0, 0.03)) * 160.0) * ember * 0.35;
  c = mix(c, mix(orange, cream, e), max(e, eg) * (1.0 - a));
  a = max(a, max(e, eg));

  // sparks: a burst when it lights, then a few slow embers
  if (u_ignite >= 0.0) {
    for (int i = 0; i < 14; i++) {
      float fi = float(i);
      bool burst = i < 10;
      float life = burst ? 0.9 + hash(fi) * 0.5 : 1.8;
      float age = burst ? u_ignite - hash(fi + 3.0) * 0.18 : mod(t * 0.55 + hash(fi + 7.0) * 1.8, 1.8);
      if (age < 0.0 || age > life) continue;
      float k = age / life;
      float side = (hash(fi + 11.0) - 0.5);
      vec2 sp = vec2(side * (burst ? 0.55 : 0.18) * sqrt(age) + sin(age * 5.0 + fi) * 0.02, 0.08 + (burst ? 0.75 : 0.5) * age - (burst ? 0.18 : 0.0) * age * age);
      sp *= u_zoom > 1.0 ? 0.0 : 1.0; // no sparks inside the tiny dot
      float r2 = dot(p - sp, p - sp);
      float spark = exp(-r2 * 5200.0) * (1.0 - k) * (burst ? 1.0 : 0.6);
      c = mix(c, mix(yellow, cream, spark), spark * (1.0 - A));
      a = max(a, spark);
    }
  }

  // nothing may touch the canvas edge, or the glow would show the canvas as a box
  float edge = smoothstep(0.5, 0.4, abs(v_uv.x - 0.5)) * smoothstep(1.0, 0.86, v_uv.y);
  a *= u_zoom > 1.0 ? 1.0 : edge;
  o = vec4(c * a, a);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader');
  return sh;
}

interface FireProps {
  lit: boolean;
  width?: number;
  height?: number;
  /** a bigger flame for tiny, clipped canvases (no sparks) */
  fill?: boolean;
  className?: string;
}

export function Fire({ lit, width = 170, height = 210, fill = false, className }: FireProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const target = useRef(lit ? 1 : 0);
  const [failed, setFailed] = useState(false);
  target.current = lit ? 1 : 0;

  useEffect(() => {
    const el = canvas.current;
    const gl = el?.getContext('webgl2', { premultipliedAlpha: true, antialias: true });
    if (!el || !gl) {
      setFailed(true);
      return;
    }
    let prog: WebGLProgram;
    try {
      prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
    } catch {
      setFailed(true);
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = Math.round(width * dpr);
    el.height = Math.round(height * dpr);
    gl.viewport(0, 0, el.width, el.height);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = (name: string) => gl.getUniformLocation(prog, name);
    const uTime = u('u_time');
    const uSize = u('u_size');
    const uIgnite = u('u_ignite');
    gl.uniform1f(u('u_aspect'), width / height);
    gl.uniform1f(u('u_zoom'), fill ? 1.7 : 1);
    gl.clearColor(0, 0, 0, 0);

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // always start from the ember, so a flame that mounts lit still catches
    let size = 0;
    let vel = 0;
    let litAt = -1;
    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const goal = target.current;
      if (goal === 1 && litAt === -1) litAt = now / 1000;
      if (goal === 0) litAt = -1;
      if (still) size = goal;
      else {
        // a slightly under-damped spring: the flame jumps up, overshoots, settles
        vel += ((goal - size) * 140 - vel * 12) * dt;
        size += vel * dt;
      }
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTime, still ? 1.3 : now / 1000);
      gl.uniform1f(uSize, Math.max(0, size));
      gl.uniform1f(uIgnite, litAt < 0 || still ? -1 : now / 1000 - litAt);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
    };
  }, [width, height, fill]);

  if (failed) return <Flame size={Math.round(height * 0.6)} className={className} color={lit ? '#f2830d' : '#d6d1c7'} aria-hidden />;
  return <canvas ref={canvas} className={className} style={{ width, height }} aria-hidden />;
}
