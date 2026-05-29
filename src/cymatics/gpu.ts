// GPU particle backend for the cymatic "vibrations" mode.
//
// Ports the EXACT CPU physics from cymatics/particles.ts (STR=0.45, NOISE=0.6,
// damping 0.91, integrate *dt*60, boundary reflect *-0.3, home spring) into a
// fragment shader, plus chladni()/gradChladni() (math in docs/02-cymatics.md)
// into GLSL. Particle state lives in float textures, ping-ponged each frame:
//
//   stateTexture (RGBA float) = [pos.x, pos.y, vel.x, vel.y]   (ping-ponged)
//   originTexture (RGBA float) = [origin.x, origin.y, 0, 0]     (static)
//   colorTexture  (RGBA float) = [r, g, b, 1]  (0..1)           (static)
//
// One particle per texel; texSize = ceil(sqrt(count)). The physics pass renders
// a full-screen quad over the state framebuffer (gl_FragCoord identifies the
// particle). The draw pass renders `count` POINTS; the vertex shader texel-fetches
// the particle's position by its per-point index attribute and maps it to clip
// space; the fragment shader emits the particle colour, blended over the dark bg.
//
// This is ADDITIVE: main.ts only uses it when isGpuSupported() returns a context;
// otherwise it keeps the CPU ImageData path unchanged.

import type { PhysicsState, PhysicsConfig } from "../types";
import { BG_RGB, SAMPLE_R_FRAC, CONTAIN_R_FRAC } from "../grid";

// Max simultaneous Chladni modes in the superposition (GLSL/regl array size).
const MAX_MODES = 8;
function padTo(arr: number[], fill: number): number[] {
  const out = new Array<number>(MAX_MODES);
  for (let i = 0; i < MAX_MODES; i++) out[i] = i < arr.length ? arr[i] : fill;
  return out;
}

// regl is loaded lazily so a non-WebGL environment never pays for it and the
// CPU fallback stays the safe default. The factory has an awkward overloaded
// type; we import the namespace for the option/handle types.
import createREGL from "regl";
import type { Regl, Texture2D, Framebuffer2D, DrawCommand, DefaultContext } from "regl";

/** Build the seed arrays the GPU backend needs from an offscreen mandala. */
export interface SeedData {
  /** length count*2 — normalized [0,1] xy per particle (then scaled to texSize). */
  positions: Float32Array;
  /** length count*2 — origin xy, same space as positions. */
  origins: Float32Array;
  /** length count*3 — rgb 0..255 per particle. */
  colors: Uint8Array;
  count: number;
}

/**
 * Feature-detect WebGL2 (or WebGL1 + float-render extensions) on the given
 * canvas. Returns true only if a float framebuffer can actually be created AND
 * rendered to (some drivers advertise the extension but fail the render). The
 * probe is destroyed before returning so the canvas is left clean for init().
 */
export function isGpuSupported(): boolean {
  // A canvas context is permanent once acquired, so probe on a throwaway canvas
  // (never the real #glcanvas — that one is reserved for init()).
  const probe = document.createElement("canvas");
  probe.width = 4;
  probe.height = 4;
  let gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;
  let isWebGL2 = false;
  try {
    gl = probe.getContext("webgl2");
    isWebGL2 = !!gl;
    if (!gl) {
      gl =
        (probe.getContext("webgl") as WebGLRenderingContext | null) ??
        (probe.getContext("experimental-webgl") as WebGLRenderingContext | null);
    }
  } catch {
    gl = null;
  }
  if (!gl) return false;

  try {
    if (isWebGL2) {
      const gl2 = gl as WebGL2RenderingContext;
      // WebGL2: need to be able to render to a float (or half-float) color buffer.
      const colorFloat = gl2.getExtension("EXT_color_buffer_float");
      const colorHalf = gl2.getExtension("EXT_color_buffer_half_float");
      if (!colorFloat && !colorHalf) return false;
      return probeFloatFramebuffer(gl2, true);
    } else {
      const gl1 = gl as WebGLRenderingContext;
      const texFloat = gl1.getExtension("OES_texture_float");
      if (!texFloat) return false;
      // Rendering TO a float texture needs WEBGL_color_buffer_float (or the
      // half-float pair). Probe whichever is present.
      const cbFloat = gl1.getExtension("WEBGL_color_buffer_float");
      const texHalf = gl1.getExtension("OES_texture_half_float");
      const cbHalf = gl1.getExtension("EXT_color_buffer_half_float");
      if (!cbFloat && !(texHalf && cbHalf)) return false;
      return probeFloatFramebuffer(gl1, false);
    }
  } catch {
    return false;
  } finally {
    const ext = gl.getExtension("WEBGL_lose_context");
    if (ext) ext.loseContext();
  }
}

/** Create a tiny float texture + framebuffer and confirm it is complete. */
function probeFloatFramebuffer(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  isWebGL2: boolean,
): boolean {
  const tex = gl.createTexture();
  const fb = gl.createFramebuffer();
  if (!tex || !fb) return false;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const internalFormat = isWebGL2 ? (gl as WebGL2RenderingContext).RGBA32F : gl.RGBA;
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, gl.RGBA, gl.FLOAT, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fb);
  gl.deleteTexture(tex);
  return status === gl.FRAMEBUFFER_COMPLETE;
}

// ---- GLSL ------------------------------------------------------------------

// Chladni field + gradient — math from docs/02-cymatics.md.
// f(u,v) = cos(mπu)cos(nπv) − cos(nπu)cos(mπv)
const GLSL_CHLADNI = `
const float PI = 3.141592653589793;
float chladni(vec2 uv, float m, float n) {
  float pu = PI * uv.x;
  float pv = PI * uv.y;
  return cos(m * pu) * cos(n * pv) - cos(n * pu) * cos(m * pv);
}
vec2 gradChladni(vec2 uv, float m, float n) {
  float pu = PI * uv.x;
  float pv = PI * uv.y;
  float dfdu = -m * PI * sin(m * pu) * cos(n * pv) + n * PI * sin(n * pu) * cos(m * pv);
  float dfdv = -n * PI * cos(m * pu) * sin(n * pv) + m * PI * cos(n * pu) * sin(m * pv);
  return vec2(dfdu, dfdv);
}
// Cheap hash noise on screen position + time, returns ~[-0.5, 0.5].
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z) - 0.5;
}
`;

// Physics pass — a full-screen quad. vUv picks the texel/particle. Ports
// particles.ts step() exactly. State texel = [pos.x, pos.y, vel.x, vel.y];
// origin is read from a static second sampler for the home spring.
const PHYSICS_FRAG = `
precision highp float;
${GLSL_CHLADNI}
const int MAX_MODES = 8;
uniform sampler2D state;
uniform sampler2D originTex;
uniform float W;
uniform float amp, home, dt, uTime;
uniform float STR, NOISE, DAMPING;
uniform int   uModeCount;        // 0..MAX_MODES active modes
uniform float uM[MAX_MODES];
uniform float uN[MAX_MODES];
uniform float uW[MAX_MODES];     // normalized weights (sum to 1)
varying vec2 vUv;
void main() {
  vec4 s = texture2D(state, vUv);
  vec2 origin = texture2D(originTex, vUv).xy;
  vec2 pos = s.xy;
  vec2 vel = s.zw;

  if (amp > 0.001 && uModeCount > 0) {
    vec2 uv = pos / W;
    // Weighted superposition of Chladni modes — the live spectrum's nodal field.
    float f = 0.0;
    vec2 grad = vec2(0.0);
    for (int k = 0; k < MAX_MODES; k++) {   // constant loop bound (GLSL ES 100)
      if (k >= uModeCount) break;           // dynamic cutoff
      float w = uW[k];
      f    += w * chladni(uv, uM[k], uN[k]);
      grad += w * gradChladni(uv, uM[k], uN[k]);
    }
    vec2 force = -2.0 * f * grad * STR * amp; // f, grad are the SUMS -> -∇(f²)
    vel += force * dt;
    float nz = abs(f) * amp * NOISE;
    // Two decorrelated noise samples (x uses +uTime, y uses a phase offset).
    vel.x += hash12(gl_FragCoord.xy + uTime) * nz;
    vel.y += hash12(gl_FragCoord.xy + uTime + 17.0) * nz;
  }

  if (home > 0.0) {
    vel += (origin - pos) * home;
  }

  vel *= DAMPING;
  pos += vel * dt * 60.0;

  // Circular containment — reflect at a disc so nothing reaches the canvas edge.
  vec2 cC = vec2(W * 0.5);
  vec2 rel = pos - cC;
  float rdist = length(rel);
  float rmax = W * ${CONTAIN_R_FRAC};
  if (rdist > rmax) {
    vec2 nrm = rel / rdist; // rdist > rmax > 0 in-branch; matches the CPU path
    pos = cC + nrm * rmax;
    float vn = dot(vel, nrm);
    if (vn > 0.0) vel -= 1.3 * vn * nrm;
  }

  gl_FragColor = vec4(pos, vel);
}
`;

const PHYSICS_VERT = `
precision highp float;
attribute vec2 position;   // full-screen quad in clip space
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

// Draw pass — one POINT per particle. The vertex shader fetches the particle's
// position from the state texture using its index, mapped to texel center.
const DRAW_VERT = `
precision highp float;
attribute float pindex;     // 0 .. count-1
uniform sampler2D state;
uniform sampler2D colorTex;
uniform vec2 texSize;
uniform float W;
uniform float pointSize;
varying vec3 vColor;
void main() {
  float ix = mod(pindex, texSize.x);
  float iy = floor(pindex / texSize.x);
  vec2 uv = (vec2(ix, iy) + 0.5) / texSize;
  vec2 pos = texture2D(state, uv).xy;
  vColor = texture2D(colorTex, uv).rgb;
  // pos is in [0, W]; map to clip space [-1, 1]. Y is flipped so the GPU render
  // matches the CPU ImageData orientation (row 0 at the top).
  vec2 clip = (pos / W) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = pointSize;
}
`;

const DRAW_FRAG = `
precision highp float;
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, 1.0);
}
`;

interface StepProps {
  target: Framebuffer2D;
  state: Framebuffer2D;
  originTex: Texture2D;
  W: number;
  amp: number;
  home: number;
  dt: number;
  uTime: number;
  str: number;
  noise: number;
  damping: number;
  uModeCount: number;
  uM: number[]; // length MAX_MODES
  uN: number[];
  uW: number[];
}

interface DrawProps {
  state: Framebuffer2D;
  [k: string]: unknown;
}

/** GPU particle simulation. Construct with init(); never throws after that. */
export class GpuParticles {
  private regl: Regl;
  private W: number;
  private texSize = 0;
  private _count = 0;
  private time = 0;

  private fbos: [Framebuffer2D, Framebuffer2D] | null = null;
  private originTex: Texture2D | null = null;
  private colorTex: Texture2D | null = null;
  private indexBuffer: ReturnType<Regl["buffer"]> | null = null;
  private ping = 0;

  private physicsCmd: DrawCommand<DefaultContext, StepProps>;
  private drawCmd: DrawCommand<DefaultContext, DrawProps>;
  private quadBuffer: ReturnType<Regl["buffer"]>;

  private constructor(regl: Regl, W: number) {
    this.regl = regl;
    this.W = W;

    this.quadBuffer = regl.buffer([
      [-1, -1],
      [1, -1],
      [-1, 1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ]);

    this.physicsCmd = regl<Record<string, unknown>, { position: unknown }, StepProps>({
      vert: PHYSICS_VERT,
      frag: PHYSICS_FRAG,
      attributes: { position: this.quadBuffer },
      uniforms: {
        state: (_c: DefaultContext, p: StepProps) => p.state,
        originTex: (_c: DefaultContext, p: StepProps) => p.originTex,
        W: (_c: DefaultContext, p: StepProps) => p.W,
        amp: (_c: DefaultContext, p: StepProps) => p.amp,
        home: (_c: DefaultContext, p: StepProps) => p.home,
        dt: (_c: DefaultContext, p: StepProps) => p.dt,
        uTime: (_c: DefaultContext, p: StepProps) => p.uTime,
        uModeCount: (_c: DefaultContext, p: StepProps) => p.uModeCount,
        // Array uniforms set per-element (the most portable regl form).
        "uM[0]": (_c: DefaultContext, p: StepProps) => p.uM[0],
        "uM[1]": (_c: DefaultContext, p: StepProps) => p.uM[1],
        "uM[2]": (_c: DefaultContext, p: StepProps) => p.uM[2],
        "uM[3]": (_c: DefaultContext, p: StepProps) => p.uM[3],
        "uM[4]": (_c: DefaultContext, p: StepProps) => p.uM[4],
        "uM[5]": (_c: DefaultContext, p: StepProps) => p.uM[5],
        "uM[6]": (_c: DefaultContext, p: StepProps) => p.uM[6],
        "uM[7]": (_c: DefaultContext, p: StepProps) => p.uM[7],
        "uN[0]": (_c: DefaultContext, p: StepProps) => p.uN[0],
        "uN[1]": (_c: DefaultContext, p: StepProps) => p.uN[1],
        "uN[2]": (_c: DefaultContext, p: StepProps) => p.uN[2],
        "uN[3]": (_c: DefaultContext, p: StepProps) => p.uN[3],
        "uN[4]": (_c: DefaultContext, p: StepProps) => p.uN[4],
        "uN[5]": (_c: DefaultContext, p: StepProps) => p.uN[5],
        "uN[6]": (_c: DefaultContext, p: StepProps) => p.uN[6],
        "uN[7]": (_c: DefaultContext, p: StepProps) => p.uN[7],
        "uW[0]": (_c: DefaultContext, p: StepProps) => p.uW[0],
        "uW[1]": (_c: DefaultContext, p: StepProps) => p.uW[1],
        "uW[2]": (_c: DefaultContext, p: StepProps) => p.uW[2],
        "uW[3]": (_c: DefaultContext, p: StepProps) => p.uW[3],
        "uW[4]": (_c: DefaultContext, p: StepProps) => p.uW[4],
        "uW[5]": (_c: DefaultContext, p: StepProps) => p.uW[5],
        "uW[6]": (_c: DefaultContext, p: StepProps) => p.uW[6],
        "uW[7]": (_c: DefaultContext, p: StepProps) => p.uW[7],
        STR: (_c: DefaultContext, p: StepProps) => p.str,
        NOISE: (_c: DefaultContext, p: StepProps) => p.noise,
        DAMPING: (_c: DefaultContext, p: StepProps) => p.damping,
      },
      count: 6,
      primitive: "triangles",
      depth: { enable: false },
      // framebuffer is the OTHER ping-pong target; set per call in step().
      framebuffer: (_c: DefaultContext, p: StepProps) => p.target,
    });

    this.drawCmd = regl<Record<string, unknown>, { pindex: unknown }, DrawProps>({
      vert: DRAW_VERT,
      frag: DRAW_FRAG,
      attributes: { pindex: () => this.indexBuffer as ReturnType<Regl["buffer"]> },
      uniforms: {
        state: (_c: DefaultContext, p: DrawProps) => p.state,
        colorTex: () => this.colorTex as Texture2D,
        texSize: () => [this.texSize, this.texSize] as [number, number],
        W: this.W,
        pointSize: 1.0,
      },
      count: () => this._count,
      primitive: "points",
      depth: { enable: false },
      blend: {
        enable: true,
        func: { srcRGB: "src alpha", srcAlpha: 1, dstRGB: "one minus src alpha", dstAlpha: 1 },
      },
    });
  }

  /**
   * Create the GPU backend on `glCanvas`. Returns null if regl/float textures
   * cannot be initialized (the caller falls back to the CPU path). `W` is the
   * simulation field size (also the GPU sampling resolution).
   */
  static init(glCanvas: HTMLCanvasElement, W: number): GpuParticles | null {
    let regl: Regl;
    try {
      regl = createREGL({
        canvas: glCanvas,
        attributes: { alpha: false, antialias: false, premultipliedAlpha: false, depth: false },
        extensions: [],
        optionalExtensions: [
          "OES_texture_float",
          "OES_texture_half_float",
          "WEBGL_color_buffer_float",
          "EXT_color_buffer_float",
          "EXT_color_buffer_half_float",
        ],
      });
    } catch {
      return null;
    }
    return new GpuParticles(regl, W);
  }

  get count(): number {
    return this._count;
  }

  /** Choose the texel-square side for a given particle count. */
  private static sizeFor(count: number): number {
    return Math.max(1, Math.ceil(Math.sqrt(count)));
  }

  /**
   * Upload initial particle state. Positions/origins are in [0, W] space (xy
   * interleaved); colors are rgb 0..255 (interleaved). Reallocates textures to
   * fit `data.count`. Safe to call repeatedly (re-seed on particle-count change).
   */
  seed(data: SeedData): void {
    const count = data.count;
    const texSize = GpuParticles.sizeFor(count);
    const texels = texSize * texSize;

    const stateArr = new Float32Array(texels * 4);
    const originArr = new Float32Array(texels * 4);
    const colorArr = new Float32Array(texels * 4);

    for (let i = 0; i < count; i++) {
      const px = data.positions[i * 2];
      const py = data.positions[i * 2 + 1];
      const ox = data.origins[i * 2];
      const oy = data.origins[i * 2 + 1];
      stateArr[i * 4] = px;
      stateArr[i * 4 + 1] = py;
      stateArr[i * 4 + 2] = 0; // vel.x
      stateArr[i * 4 + 3] = 0; // vel.y
      originArr[i * 4] = ox;
      originArr[i * 4 + 1] = oy;
      colorArr[i * 4] = data.colors[i * 3] / 255;
      colorArr[i * 4 + 1] = data.colors[i * 3 + 1] / 255;
      colorArr[i * 4 + 2] = data.colors[i * 3 + 2] / 255;
      colorArr[i * 4 + 3] = 1;
    }

    // Tear down any previous allocation.
    this.disposeBuffers();

    const texOpts = {
      width: texSize,
      height: texSize,
      type: "float" as const,
      format: "rgba" as const,
      min: "nearest" as const,
      mag: "nearest" as const,
      wrapS: "clamp" as const,
      wrapT: "clamp" as const,
    };

    this.originTex = this.regl.texture({ ...texOpts, data: originArr });
    this.colorTex = this.regl.texture({ ...texOpts, data: colorArr });

    const makeFbo = (init: Float32Array): Framebuffer2D =>
      this.regl.framebuffer({
        color: this.regl.texture({ ...texOpts, data: init }),
        depthStencil: false,
      });

    // Both ping-pong targets start with the seeded state.
    this.fbos = [makeFbo(stateArr), makeFbo(stateArr.slice())];
    this.ping = 0;

    const indices = new Float32Array(count);
    for (let i = 0; i < count; i++) indices[i] = i;
    this.indexBuffer = this.regl.buffer(indices);

    this.texSize = texSize;
    this._count = count;
    this.time = 0;
  }

  /** Run one physics step, consuming the shared field state. No-op if unseeded. */
  step(state: PhysicsState, dt: number, cfg: PhysicsConfig): void {
    if (!this.fbos || !this.originTex) return;
    this.time += dt;
    const src = this.fbos[this.ping];
    const dst = this.fbos[1 - this.ping];
    const modes =
      state.modes && state.modes.length ? state.modes : [{ m: state.m, n: state.n, w: 1 }];
    this.physicsCmd({
      target: dst,
      state: src,
      originTex: this.originTex,
      W: this.W,
      amp: state.amp,
      home: state.home,
      dt,
      uTime: this.time,
      str: cfg.str,
      noise: cfg.noise,
      damping: cfg.damping,
      uModeCount: Math.min(MAX_MODES, modes.length),
      uM: padTo(modes.map((x) => x.m), 1),
      uN: padTo(modes.map((x) => x.n), 2),
      uW: padTo(modes.map((x) => x.w), 0),
    });
    this.ping = 1 - this.ping;
  }

  /** Clear the canvas to the mandala background and draw the particle points. */
  draw(): void {
    if (!this.fbos) return;
    this.regl.clear({
      color: [BG_RGB[0] / 255, BG_RGB[1] / 255, BG_RGB[2] / 255, 1],
      depth: 1,
    });
    this.drawCmd({ state: this.fbos[this.ping] });
  }

  /** Resize the WebGL drawing buffer to match the canvas backing store. */
  resize(): void {
    this.regl.poll();
  }

  private disposeBuffers(): void {
    if (this.fbos) {
      this.fbos[0].destroy();
      this.fbos[1].destroy();
      this.fbos = null;
    }
    if (this.originTex) {
      this.originTex.destroy();
      this.originTex = null;
    }
    if (this.colorTex) {
      this.colorTex.destroy();
      this.colorTex = null;
    }
    if (this.indexBuffer) {
      this.indexBuffer.destroy();
      this.indexBuffer = null;
    }
    this._count = 0;
  }

  /** Release every GPU resource and the regl context. */
  destroy(): void {
    this.disposeBuffers();
    this.quadBuffer.destroy();
    this.regl.destroy();
  }
}

/**
 * Build importance-sampled seed arrays from an offscreen-rendered mandala.
 * Mirrors sampleParticles(): keep pixels whose squared RGB distance from the
 * background exceeds 1500. Collects ALL such pixels, then samples (with
 * replacement + jitter) up to `count` particles so the GPU always gets the
 * requested population even when the mandala has fewer bright pixels.
 */
export function buildSeed(srcCtx: CanvasRenderingContext2D, W: number, count: number): SeedData {
  const img = srcCtx.getImageData(0, 0, W, W);
  const d = img.data;

  // Pass 1: gather candidate pixels (xy + rgb) above the colour-distance gate,
  // cropped to the disc so the seeded cloud stays inside the canvas.
  const cx: number[] = [];
  const cy: number[] = [];
  const cr: number[] = [];
  const cg: number[] = [];
  const cb: number[] = [];
  const ccx = W / 2;
  const ccy = W / 2;
  const rc2 = (SAMPLE_R_FRAC * W) * (SAMPLE_R_FRAC * W);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const ddx = x - ccx;
      const ddy = y - ccy;
      if (ddx * ddx + ddy * ddy > rc2) continue; // crop to the disc
      const i = (y * W + x) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const dr = r - BG_RGB[0];
      const dg = g - BG_RGB[1];
      const db = b - BG_RGB[2];
      if (dr * dr + dg * dg + db * db > 1500) {
        cx.push(x);
        cy.push(y);
        cr.push(r);
        cg.push(g);
        cb.push(b);
      }
    }
  }

  const positions = new Float32Array(count * 2);
  const origins = new Float32Array(count * 2);
  const colors = new Uint8Array(count * 3);

  const avail = cx.length;
  if (avail === 0) {
    // Degenerate (blank) mandala: scatter dim particles within the disc.
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * SAMPLE_R_FRAC * W;
      const x = ccx + Math.cos(ang) * rad;
      const y = ccy + Math.sin(ang) * rad;
      positions[i * 2] = x;
      positions[i * 2 + 1] = y;
      origins[i * 2] = x;
      origins[i * 2 + 1] = y;
      colors[i * 3] = BG_RGB[0];
      colors[i * 3 + 1] = BG_RGB[1];
      colors[i * 3 + 2] = BG_RGB[2];
    }
    return { positions, origins, colors, count };
  }

  // Sample with replacement up to `count`. When count > avail we duplicate
  // candidates with sub-pixel jitter so dense modes don't show a grid pattern;
  // the origin keeps the exact source pixel so reformation stays crisp.
  for (let i = 0; i < count; i++) {
    const k = i < avail ? i : Math.floor(Math.random() * avail);
    const jitter = i < avail ? 0 : (Math.random() - 0.5);
    const px = cx[k] + jitter;
    const py = cy[k] + jitter;
    positions[i * 2] = px;
    positions[i * 2 + 1] = py;
    origins[i * 2] = cx[k];
    origins[i * 2 + 1] = cy[k];
    colors[i * 3] = cr[k];
    colors[i * 3 + 1] = cg[k];
    colors[i * 3 + 2] = cb[k];
  }

  return { positions, origins, colors, count };
}
