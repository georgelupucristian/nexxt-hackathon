import { useEffect, useRef, useState } from 'react';
import { Flame } from '@/lib/icons';

/**
 * A real-time flame for the streak moment. A drawn SVG flame read as clip art next to Kip's 3D
 * renders, so this one is a small WebGL2 fragment shader: a teardrop eaten into by rising noise,
 * which flickers on its own and never loops visibly. `lit` eases the power from a cold grey ember
 * to a full flame, so "lighting up" is one continuous motion instead of a swap between two images.
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
uniform float u_power;  // 0 = cold ember, 1 = full flame
uniform float u_aspect; // width / height

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  float p = u_power;
  float t = u_time;
  // y in flame heights: the flame grows from a squat ember to its full height as it lights
  float h = (v_uv.y - 0.05) / mix(0.5, 0.94, p);
  float x = (v_uv.x - 0.5) * u_aspect;

  // turbulence rises through the flame and pushes the upper part sideways
  float n = fbm(vec2(x * 3.4, v_uv.y * 2.4 - t * 1.7));
  float n2 = fbm(vec2(x * 6.5 + 11.0, v_uv.y * 4.6 - t * 2.9));
  x += (n - 0.5) * 0.34 * h * p;

  // teardrop: round belly, tapering tip
  float r = 0.24;
  float w = h < r ? sqrt(max(0.0, r * r - (h - r) * (h - r))) : r * pow(max(0.0, 1.0 - (h - r) / (0.94 - r)), 1.3);
  // below the base there is no flame, only a fading glow
  float edge = w - abs(x) - max(0.0, -h) * 3.0;
  // tongues: the noise eats into the top half
  edge -= smoothstep(0.3, 1.0, h) * (n2 - 0.38) * 0.2 * p;

  float body = smoothstep(-0.012, 0.022, edge);
  float core = smoothstep(0.02, 0.15, edge) * (1.0 - smoothstep(0.12, 0.62, h));
  float glow = exp(-max(-edge, 0.0) * 26.0) * (1.0 - smoothstep(0.2, 1.0, h)) * smoothstep(-0.06, 0.04, h) * 0.38 * p;

  vec3 deep = vec3(0.86, 0.24, 0.06);
  vec3 mid = vec3(1.0, 0.50, 0.10);
  vec3 hot = vec3(1.0, 0.80, 0.30);
  vec3 white = vec3(1.0, 0.95, 0.80);
  vec3 col = mix(deep, mid, smoothstep(0.0, 0.07, edge) * (1.0 - h * 0.35));
  col = mix(col, hot, core);
  col = mix(col, white, core * core * 0.55);
  // cold: one flat warm grey, matching the app's empty states
  vec3 cold = vec3(0.84, 0.82, 0.78);
  col = mix(cold, col, p);

  float a = max(body, glow);
  vec3 c = mix(mix(cold, mid, p), col, body);
  o = vec4(c * a, a);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader');
  return sh;
}

export function Fire({ lit, width = 150, height = 190, className }: { lit: boolean; width?: number; height?: number; className?: string }) {
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
    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uPower = gl.getUniformLocation(prog, 'u_power');
    gl.uniform1f(gl.getUniformLocation(prog, 'u_aspect'), width / height);
    gl.clearColor(0, 0, 0, 0);

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let power = target.current;
    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // ease towards the target; a reduced-motion user gets the end state at once
      power = still ? target.current : power + (target.current - power) * (1 - Math.exp(-dt * 5));
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTime, still ? 1.3 : now / 1000);
      gl.uniform1f(uPower, power);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
    };
  }, [width, height]);

  if (failed) return <Flame size={Math.round(height * 0.6)} className={className} color={lit ? '#f2830d' : '#d6d1c7'} aria-hidden />;
  return <canvas ref={canvas} className={className} style={{ width, height }} aria-hidden />;
}
