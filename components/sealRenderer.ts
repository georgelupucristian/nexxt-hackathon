// WebGL2 renderer that makes the still pose images feel alive.
//
// The pose is drawn on a dense grid mesh instead of a single quad, so we can bend
// it: the belly widens when breathing, the body sways with the head lagging
// behind it, and everything squashes around the point where the belly meets the
// ground. A tiny physics loop (springs + gravity) drives hops, squash/stretch and
// the entrance, which is what sells the motion; plain CSS transforms can only
// move the image as one stiff card.

import type { SealState } from "./Seal";

export type SealAppear = "pop" | "slide" | "none";

// Pose renders sit on y=702 of a 768 canvas; x=0.56 is roughly under the belly.
const GROUND = 702 / 768;
const PIVOT_X = 0.56;

// Extra room around the seal's box so hops and the slide-in aren't clipped.
const PAD_X = 0.14;
const PAD_TOP = 0.3;
const GRID = 40;

type Motion = {
  breath: number; // belly expansion amount
  breathSpeed: number; // radians per second
  sway: number; // side-to-side lean amount
  swaySpeed: number;
  fidget: boolean; // random little hops and leans while idling
  bounce?: number; // seconds between automatic hops (happy)
  nudge?: number; // seconds between leans toward the pointed side (point)
  settle?: number; // constant squash, makes the seal look heavier (sad)
};

const MOTION: Record<SealState, Motion> = {
  idle: { breath: 1.2, breathSpeed: 1.9, sway: 0.9, swaySpeed: 0.9, fidget: true },
  happy: { breath: 0.7, breathSpeed: 2.6, sway: 0.9, swaySpeed: 2.2, fidget: false, bounce: 0.75 },
  celebrate: { breath: 0.6, breathSpeed: 2.6, sway: 0.8, swaySpeed: 2.4, fidget: false },
  wave: { breath: 0.8, breathSpeed: 2.2, sway: 1.5, swaySpeed: 3.2, fidget: false },
  think: { breath: 0.8, breathSpeed: 1.6, sway: 0.9, swaySpeed: 0.7, fidget: false },
  point: { breath: 0.8, breathSpeed: 2, sway: 0.3, swaySpeed: 1, fidget: false, nudge: 1.6 },
  sleep: { breath: 1.8, breathSpeed: 1.2, sway: 0, swaySpeed: 0, fidget: false },
  sad: { breath: 0.7, breathSpeed: 1.3, sway: 0.4, swaySpeed: 0.6, fidget: false, settle: 0.025 },
};

const VERT = `#version 300 es
in vec2 aUv;
uniform float uTime, uBreath, uBreathSpeed, uSway, uSwaySpeed, uLean, uQ, uLift, uShiftX, uFlip;
uniform vec4 uFrame; // padX, padTop, canvas width, canvas height (in seal-box units)
out vec2 vUv;
out float vY;
const float G = ${GROUND.toFixed(4)};
const float P = ${PIVOT_X.toFixed(4)};
void main() {
  vec2 p = aUv;
  float h = clamp((G - p.y) / G, 0.0, 1.0); // 0 at the ground, 1 at the top of the canvas

  // breathing: chest widens around mid-height, top rises a touch
  float b = uBreath * sin(uTime * uBreathSpeed);
  p.x += (p.x - P) * b * 0.03 * sin(h * 3.14159);
  p.y -= b * 0.018 * h;

  // sway grows with height (feet planted), head follows a beat later
  float s = uSway * sin(uTime * uSwaySpeed);
  p.x += (s + uLean) * 0.035 * h * h;
  p.x += uSway * sin(uTime * uSwaySpeed - 0.9) * 0.015 * smoothstep(0.5, 0.95, h);

  // squash (uQ > 0) / stretch (uQ < 0) around the ground contact point
  p.x = P + (p.x - P) * (1.0 + 0.55 * uQ);
  p.y = G + (p.y - G) * (1.0 - uQ);

  p.y -= uLift;
  vY = p.y;
  vUv = aUv;
  if (uFlip > 0.5) p.x = 1.0 - p.x;
  p.x += uShiftX;

  vec2 c = vec2((uFrame.x + p.x) / uFrame.z, (uFrame.y + p.y) / uFrame.w);
  gl_Position = vec4(c.x * 2.0 - 1.0, 1.0 - c.y * 2.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision mediump float;
in vec2 vUv;
in float vY;
uniform sampler2D uFrom, uTo;
uniform float uMix, uAlpha;
out vec4 outColor;
void main() {
  vec4 c = mix(texture(uFrom, vUv), texture(uTo, vUv), uMix);
  // anything pushed below the ground line is hidden: that's what lets the
  // seal pop up "out of" the card edge on entrance
  c *= 1.0 - smoothstep(${(GROUND + 0.002).toFixed(4)}, ${(GROUND + 0.012).toFixed(4)}, vY);
  outColor = c * uAlpha;
}`;

type Spring = { x: number; v: number };

function stepSpring(s: Spring, target: number, k: number, c: number, dt: number) {
  s.v += (-k * (s.x - target) - c * s.v) * dt;
  s.x += s.v * dt;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class SealRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private indexCount: number;
  private textures = new Map<SealState, WebGLTexture>();
  private loading = new Map<SealState, Promise<WebGLTexture>>();
  private raf = 0;
  private last = 0;
  private time = 0;
  private destroyed = false;

  private state: SealState | null = null;
  private flip = false;
  private from: WebGLTexture | null = null;
  private to: WebGLTexture | null = null;
  private mix = 1;
  private mixDelay = 0;

  // physics
  private squash: Spring = { x: 0, v: 0 };
  private lean: Spring = { x: 0, v: 0 };
  private height = 0; // hop height above ground, seal-box units
  private vy = 0;
  private pendingLaunch = -1; // seconds until a queued hop leaves the ground
  private pendingLaunchV = 0;
  private enterY: Spring = { x: 0, v: 0 };
  private enterX: Spring = { x: 0, v: 0 };
  private alpha = 1;
  private appear: SealAppear = "none";
  private nextAuto = 0;

  private constructor(
    private canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext,
    private onFrame: (lift: number, shiftX: number) => void,
  ) {
    this.gl = gl;
    this.program = this.buildProgram();
    this.indexCount = this.buildMesh();
    for (const name of [
      "uTime", "uBreath", "uBreathSpeed", "uSway", "uSwaySpeed", "uLean", "uQ", "uLift",
      "uShiftX", "uFlip", "uFrame", "uFrom", "uTo", "uMix", "uAlpha",
    ]) {
      this.uniforms[name] = gl.getUniformLocation(this.program, name);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // textures are premultiplied
  }

  /** Returns null when WebGL2 isn't available; the caller keeps the plain <img> fallback. */
  static create(
    canvas: HTMLCanvasElement,
    onFrame: (lift: number, shiftX: number) => void,
  ): SealRenderer | null {
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, antialias: true });
    if (!gl) return null;
    return new SealRenderer(canvas, gl, onFrame);
  }

  /** Canvas size in CSS px of the seal box (the canvas itself is padded around it). */
  static readonly frame = { padX: PAD_X, padTop: PAD_TOP, width: 1 + 2 * PAD_X, height: 1 + PAD_TOP };

  start(appear: SealAppear) {
    // The entrance waits for the first pose to load (see setState), otherwise it
    // would play while the canvas is still empty.
    this.appear = appear;
    if (appear === "slide") this.alpha = 0;
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.destroyed) return;
      this.tick(Math.min((now - this.last) / 1000, 1 / 30));
      this.last = now;
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  setState(state: SealState, flip: boolean) {
    if (state === this.state && flip === this.flip) return;
    const first = this.state === null;
    this.state = state;
    this.flip = flip;
    this.nextAuto = this.time + rand(2.5, 5);

    this.texture(state).then((tex) => {
      if (this.destroyed || this.state !== state) return;
      if (first || !this.to) {
        this.from = tex;
        this.to = tex;
        this.mix = 1;
        if (this.appear === "pop") this.enterY = { x: -0.95, v: 0 };
        if (this.appear === "slide") this.enterX = { x: -1.1, v: 0 };
        this.alpha = this.appear === "slide" ? 0 : 1;
        return;
      }
      // Crouch first, swap the pose at the bottom of the squash, then spring up:
      // the change reads as the seal moving into the new pose, not a slideshow.
      this.squash.v += 5.5;
      this.from = this.to;
      this.to = tex;
      this.mix = 0;
      this.mixDelay = 0.07;
      if (state === "celebrate") this.hop(1.45, 0.11);
    });
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    const gl = this.gl;
    this.textures.forEach((t) => gl.deleteTexture(t));
    gl.deleteProgram(this.program);
  }

  private hop(velocity: number, windup: number) {
    if (this.height > 0 || this.pendingLaunch >= 0) return;
    this.squash.v += 3.5; // anticipation crouch
    this.pendingLaunch = windup;
    this.pendingLaunchV = velocity;
  }

  private tick(dt: number) {
    this.time += dt;
    const m = this.state ? MOTION[this.state] : MOTION.idle;

    // scheduled life: fidgets while idle, rhythmic hops when happy, nudges when pointing
    if (this.time >= this.nextAuto && this.enterY.x > -0.05 && this.enterX.x > -0.05) {
      if (m.bounce) {
        this.hop(0.95, 0.08);
        this.nextAuto = this.time + m.bounce;
      } else if (m.nudge) {
        this.lean.v += this.flip ? -2.2 : 2.2;
        this.nextAuto = this.time + m.nudge;
      } else if (m.fidget) {
        const r = Math.random();
        if (r < 0.4) this.hop(0.75, 0.1);
        else if (r < 0.75) this.lean.v += rand(-2.5, 2.5);
        else this.squash.v += 3; // little shuffle in place
        this.nextAuto = this.time + rand(2.5, 5);
      } else {
        this.nextAuto = Infinity;
      }
    }

    // hop: ballistic arc, squash on landing proportional to impact speed
    if (this.pendingLaunch >= 0) {
      this.pendingLaunch -= dt;
      if (this.pendingLaunch < 0) this.vy = this.pendingLaunchV;
    }
    if (this.height > 0 || this.vy > 0) {
      this.vy -= 9 * dt;
      this.height += this.vy * dt;
      if (this.height <= 0) {
        this.height = 0;
        this.squash.v += Math.min(-this.vy * 4.5, 7);
        this.vy = 0;
      }
    }
    const airborne = this.height > 0;
    const squashTarget = airborne ? -Math.min(Math.abs(this.vy) * 0.05, 0.08) : m.settle ?? 0;
    stepSpring(this.squash, squashTarget, 220, 13, dt);
    stepSpring(this.lean, 0, 40, 5, dt);

    // entrance springs (underdamped, so they overshoot a bit and wobble to rest)
    const rising = this.enterY.x < -0.01;
    stepSpring(this.enterY, 0, 90, 11, dt);
    if (rising && this.enterY.x >= -0.01 && this.enterY.v > 0) {
      this.squash.v -= 3; // stretch as it pops out
    }
    const sliding = this.enterX.x < -0.01;
    stepSpring(this.enterX, 0, 55, 10, dt);
    if (sliding && this.enterX.x >= -0.01) {
      this.lean.v += 3.5; // momentum carries the top forward when it stops
      this.squash.v += 2;
    }
    if (this.from) this.alpha = Math.min(1, this.alpha + dt * 5);

    if (this.mixDelay > 0) this.mixDelay -= dt;
    else this.mix = Math.min(1, this.mix + dt / 0.12);

    // lift < 0 while the seal is still under the ground line during the pop-in
    if (this.from) this.onFrame(this.height + this.enterY.x, this.enterX.x);
    this.draw(m);
  }

  private draw(m: Motion) {
    const { gl, canvas, uniforms: u } = this;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.from || !this.to) return;

    gl.useProgram(this.program);
    gl.uniform1f(u.uTime, this.time);
    gl.uniform1f(u.uBreath, m.breath);
    gl.uniform1f(u.uBreathSpeed, m.breathSpeed);
    gl.uniform1f(u.uSway, m.sway);
    gl.uniform1f(u.uSwaySpeed, m.swaySpeed);
    gl.uniform1f(u.uLean, this.lean.x);
    gl.uniform1f(u.uQ, this.squash.x);
    gl.uniform1f(u.uLift, this.height + this.enterY.x);
    gl.uniform1f(u.uShiftX, this.enterX.x);
    gl.uniform1f(u.uFlip, this.flip ? 1 : 0);
    const f = SealRenderer.frame;
    gl.uniform4f(u.uFrame, f.padX, f.padTop, f.width, f.height);
    gl.uniform1f(u.uMix, this.mix);
    gl.uniform1f(u.uAlpha, this.alpha);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.from);
    gl.uniform1i(u.uFrom, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.to);
    gl.uniform1i(u.uTo, 1);

    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
  }

  private texture(state: SealState): Promise<WebGLTexture> {
    const ready = this.textures.get(state);
    if (ready) return Promise.resolve(ready);
    let pending = this.loading.get(state);
    if (!pending) {
      pending = new Promise<WebGLTexture>((resolve, reject) => {
        const img = new Image();
        img.src = `/mascot/${state}.webp`;
        img
          .decode()
          .then(() => {
            if (this.destroyed) return;
            const gl = this.gl;
            const tex = gl.createTexture()!;
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            // mipmaps keep the 768px render crisp instead of shimmering at 120px
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            this.textures.set(state, tex);
            resolve(tex);
          })
          .catch(reject);
      });
      this.loading.set(state, pending);
    }
    return pending;
  }

  private buildProgram(): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "shader");
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
    return prog;
  }

  private buildMesh(): number {
    const gl = this.gl;
    const uv: number[] = [];
    for (let y = 0; y <= GRID; y++) for (let x = 0; x <= GRID; x++) uv.push(x / GRID, y / GRID);
    const idx: number[] = [];
    for (let y = 0; y < GRID; y++)
      for (let x = 0; x < GRID; x++) {
        const i = y * (GRID + 1) + x;
        idx.push(i, i + 1, i + GRID + 1, i + 1, i + GRID + 2, i + GRID + 1);
      }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.program, "aUv");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    return idx.length;
  }
}
