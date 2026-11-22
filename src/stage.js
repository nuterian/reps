// Draws a mesh from body.js with WebGL 2: one key light with soft shadows, a
// floor that catches them and darkens under what stands on it, a rim so limbs
// stand apart, and a material for each kind of surface. Nothing is loaded.
import { STRIDE } from './body.js';

const VERT = `#version 300 es
layout(location=0) in vec3 p; layout(location=1) in vec3 n; layout(location=2) in vec4 c; layout(location=3) in vec3 r;
uniform mat4 view, light; uniform float depthOnly; 
out vec3 P, N, R, K; out vec4 S; flat out int m;
void main() {
  P = p; N = n; K = c.rgb; m = int(c.a + .5); R = r; S = light * vec4(p + n * .6, 1.);
  if (depthOnly > 1.5) gl_Position = vec4((p.xz - vec2(108., 0.)) * vec2(1., -1.) / 85., p.y / 20. - 1., 1.);
  else gl_Position = depthOnly > .5 ? light * vec4(p, 1.) : view * vec4(p, 1.);
}`;
const FRAG = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 P, N, R, K; in vec4 S; flat in int m;
uniform vec3 eye, key; uniform sampler2DShadow map, under; uniform float mode, dark, reach; uniform vec2 size, middle;
out vec4 o;
float lit() {
  vec3 q = S.xyz / S.w * .5 + .5; q.z -= .0015;
  float s = 0.;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) s += texture(map, vec3(q.xy + vec2(x, y) * .0011, q.z));
  return s / 9.;
}
float hash(vec3 q) { q = fract(q * .3183 + .1); q *= 17.; return fract(q.x * q.y * q.z * (q.x + q.y + q.z)); }
float noise(vec3 q) {
  vec3 i = floor(q), f = fract(q); f = f * f * (3. - 2. * f);
  vec2 e = vec2(0., 1.);
  return mix(mix(mix(hash(i), hash(i + e.yxx), f.x), mix(hash(i + e.xyx), hash(i + e.yyx), f.x), f.y),
    mix(mix(hash(i + e.xxy), hash(i + e.yxy), f.x), mix(hash(i + e.xyy), hash(i + e.yyy), f.x), f.y), f.z) - .5;
}
// The same, gone where it is finer than the pixels.
float grain(vec3 q) { vec3 w = fwidth(q); return noise(q) * smoothstep(1.2, .55, max(w.x, max(w.y, w.z))); }
// The normal of a surface raised by h. Never steep, so thin edges do not sparkle.
vec3 raised(vec3 n, float h) {
  vec3 x = dFdx(P), y = dFdy(P), a = cross(y, n), b = cross(n, x);
  float det = dot(x, a);
  vec3 up = (dFdx(h) * a + dFdy(h) * b) * sign(det) / max(abs(det), 1e-5);
  return normalize(n - up * min(1., .5 / max(length(up), 1e-5)));
}
void main() {
  if (mode > 1.5) { o = vec4(K, 1.); return; }
  if (mode > .5) {
    float away = length(P.xz - middle) / reach;
    vec2 rim = gl_FragCoord.xy / size;
    float edge = smoothstep(0., .04, rim.y) * smoothstep(0., .04, rim.x) * smoothstep(1., .96, rim.x);
    float fade = smoothstep(1., .4, away) * smoothstep(0., .14, rim.y) * smoothstep(0., .2, rim.x) * smoothstep(1., .8, rim.x);
    if (edge <= 0. || away > 1.4) discard;
    float s = lit();
    // Darker where something stands on the floor or hangs just above it.
    float near = 0.;
    for (int i = 0; i < 32; i++) {
      float turn = float(i) * 2.4, far = sqrt((float(i) + .5) / 32.) * 8.;
      vec2 q = (P.xz + far * vec2(cos(turn), sin(turn)) - vec2(108., 0.)) * vec2(.5, -.5) / 85. + .5;
      near += (1. - texture(under, vec3(q, (9. - far) / 40.))) / 32.;
    }
    near = smoothstep(0., .5, near) * edge;
    if (dark > .5) { vec3 f = vec3(.085, .092, .108) * (.45 + .55 * s) * (1. - .8 * near); o = vec4(f * fade, fade); }
    else { float a = 1. - (1. - (1. - s) * .2 * smoothstep(1., .5, away) * edge) * (1. - .5 * near); o = vec4(vec3(.05, .07, .12) * a, a); }
    return;
  }
  float s = lit();
  vec3 n = normalize(N), v = normalize(eye - P), base = pow(K, vec3(2.2));
  // How far light wraps past the edge, how bright and tight the highlight is,
  // how much of the room shows in it, how much cloth fuzz catches the light, and
  // the grain: its scale, and how much it raises and shades the surface.
  vec3 wrap = vec3(0.), q = R; float shine = .05, tight = 20., mirror = 0., fuzz = 0., high = 0., tone = 0.;
  if (m == 1) { wrap = vec3(.26, .12, .08); shine = .16; tight = 14.; q = R * .9; tone = .1; } // skin
  if (m == 2) { wrap = vec3(.12); shine = 0.; fuzz = .9; q = R * vec3(.16, .16, .3); high = .7; } // cloth
  if (m == 3) { shine = .22; tight = 10.; q = R * vec3(.7, 1.4, 2.6); high = .1; tone = .5; } // hair
  if (m == 4) { mirror = .7; shine = .6; tight = 60.; } // steel
  if (m == 5) { shine = .13; tight = 24.; mirror = .06; q = R * 1.4; high = .02; tone = .05; } // iron
  if (m == 6) { shine = .2; tight = 9.; mirror = .07; q = R * 1.5; high = .05; } // vinyl
  if (m == 7) { wrap = vec3(.1); fuzz = .15; } // rubber
  if (m == 8) { wrap = vec3(.2, .05, .04); shine = .4; tight = 34.; q = vec3(R.x * 1.9, 0., R.z * .35); high = .18; tone = .3; } // muscle
  float g = grain(q);
  n = raised(n, high * g);
  base *= 1. + tone * g;
  float nl = dot(n, key), facing = clamp(dot(n, v), 0., 1.), sky = .5 + .5 * n.y;
  vec3 d = max((vec3(nl) + wrap) / (1. + wrap), 0.) * mix(.12, 1., s);
  float side = .5 + .5 * dot(n, normalize(vec3(-key.x, .15, -key.z)));
  vec3 c = base * (vec3(.30, .32, .37) * mix(.55, 1.1, sky) + vec3(.16, .17, .2) * side + vec3(1.02, .98, .93) * d);
  // The room: a bright ceiling panel, pale walls, a dark line at the floor.
  vec3 r = reflect(-v, n);
  float room = .4 + .5 * smoothstep(-.2, .9, r.y) + .7 * smoothstep(.72, .95, dot(r, key)) - .22 * smoothstep(.25, 0., abs(r.y + .12));
  float edge = pow(1. - facing, 5.);
  c = mix(c, base * room * 1.25, mirror * (1. - edge)) + mirror * edge * room * .25;
  float rim = pow(1. - facing, 3.);
  c += rim * (dark > .5 ? vec3(.22, .25, .32) : vec3(.10, .11, .13)) * (.4 + .6 * sky);
  c += fuzz * base * pow(1. - facing, 2.) * (.3 + .7 * sky);
  c += shine * pow(max(dot(n, normalize(key + v)), 0.), tight) * s * .55;
  // The brightest parts level off below white, so nothing is lost on a white page.
  // One scale for all three, so colours keep their hue.
  float most = max(c.r, max(c.g, c.b));
  c *= (min(most, .5) + .3 * (1. - exp(-max(most - .5, 0.) / .3))) / max(most, 1e-4);
  o = vec4(pow(c, vec3(1. / 2.2)), 1.);
}`;

const mul = (a, b) => {
  const r = new Float32Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[i * 4 + j] += a[k * 4 + j] * b[i * 4 + k];
  return r;
};
const norm = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function lookAt(eye, at) {
  const z = norm(eye.map((x, i) => x - at[i]));
  const x = norm(cross([0, 1, 0], z));
  const y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
}
const FOV = 24;
const perspective = (aspect, near, far) => {
  const f = 1 / Math.tan((FOV * Math.PI) / 360);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0]);
};
const ortho = (r, near, far) => new Float32Array([1 / r, 0, 0, 0, 0, 1 / r, 0, 0, 0, 0, -2 / (far - near), 0, 0, 0, -(far + near) / (far - near), 1]);

// The camera for a turn of `yaw` degrees (0 is a side view, -90 face on) that
// frames every point of `cloud`.
export function frameCamera(cloud, yaw, pitch, aspect) {
  const [a, b] = [(yaw * Math.PI) / 180, (pitch * Math.PI) / 180];
  const back = [-Math.sin(a) * Math.cos(b), Math.sin(b), Math.cos(a) * Math.cos(b)];
  const right = norm(cross([0, 1, 0], back));
  const up = cross(back, right);
  const span = (axis) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of cloud) {
      const d = dot(p, axis);
      if (d < lo) lo = d;
      if (d > hi) hi = d;
    }
    return [lo, hi];
  };
  const [x, y, z] = [span(right), span(up), span(back)];
  const at = [0, 1, 2].map((i) => right[i] * (x[0] + x[1]) / 2 + up[i] * (y[0] + y[1]) / 2 + back[i] * (z[0] + z[1]) / 2);
  const half = Math.tan((FOV * Math.PI) / 360);
  const distance = Math.max((x[1] - x[0]) / aspect, y[1] - y[0]) / 2 / half + (z[1] - z[0]) / 2;
  return { at, back, right, up, distance: distance * 1.04 };
}

export function createStage(canvas) {
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true });
  if (!gl) return null;
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  gl.useProgram(program);
  const at = Object.fromEntries(['view', 'light', 'depthOnly', 'eye', 'key', 'map', 'mode', 'dark', 'reach', 'middle', 'size', 'under'].map((n) => [n, gl.getUniformLocation(program, n)]));

  // Depth maps: from the light, and from under the floor looking up.
  const depthMap = (size) => {
    const map = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, map);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE], [gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    const target = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, map, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { map, fill: (depthOnly, n) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.viewport(0, 0, size, size);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.uniform1f(at.depthOnly, depthOnly);
      gl.drawElements(gl.TRIANGLES, n, gl.UNSIGNED_SHORT, 0);
    } };
  };
  const shadow = depthMap(1024);
  const under = depthMap(72);

  const buffer = () => {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    for (const [i, size, offset] of [[0, 3, 0], [1, 3, 3], [2, 4, 6], [3, 3, 10]]) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, size, gl.FLOAT, false, STRIDE * 4, offset * 4);
    }
    let sized = 0;
    return {
      bind: () => gl.bindVertexArray(vao),
      load: (m) => {
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, m.v.subarray(0, m.n * STRIDE), gl.DYNAMIC_DRAW);
        if (sized !== m.m) {
          sized = m.m;
          gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.i.subarray(0, m.m), gl.STATIC_DRAW);
        }
      },
    };
  };
  const body = buffer();
  const path = buffer();
  const floor = buffer();
  const F = 500;
  floor.load({
    v: new Float32Array([[-F, -F], [F, -F], [F, F], [-F, F]].flatMap(([x, z]) => [x, 0, z, 0, 1, 0, 1, 1, 1, 0, 0, 0, 0])),
    i: new Uint16Array([0, 1, 2, 0, 2, 3]), n: 4, m: 6,
  });

  return {
    // mesh and dots from body.js; camera from frameCamera.
    draw(mesh, dots, camera, { dark, reach }) {
      const { at: look, back, right, up, distance } = camera;
      const [w, h] = [gl.drawingBufferWidth, gl.drawingBufferHeight];
      const eye = look.map((x, i) => x + back[i] * distance);
      const view = mul(perspective(w / h, distance / 4, distance * 3), lookAt(eye, look));
      // The key light stays over the viewer's left shoulder as the figure turns.
      const key = norm([0, 1, 2].map((i) => back[i] * 0.55 - right[i] * 0.5 + up[i] * 0.2 + (i === 1 ? 0.75 : 0)));
      const from = look.map((x, i) => x + key[i] * reach * 2.2);
      const light = mul(ortho(reach * 1.25, reach * 0.4, reach * 4.4), lookAt(from, look));
      gl.useProgram(program);
      gl.uniformMatrix4fv(at.view, false, view);
      gl.uniformMatrix4fv(at.light, false, light);
      gl.uniform3fv(at.eye, eye);
      gl.uniform3fv(at.key, key);
      gl.uniform1f(at.dark, dark ? 1 : 0);
      gl.uniform1f(at.reach, reach * 1.25);
      gl.uniform2f(at.middle, look[0], look[2]);
      gl.uniform2f(at.size, w, h);
      gl.uniform1i(at.map, 0);
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      body.load(mesh);

      const units = (a, b) => [a, b].forEach((m, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, m); });
      units(null, null);
      gl.uniform1i(at.under, 1);
      gl.uniform1f(at.mode, 2);
      shadow.fill(1, mesh.m);
      under.fill(2, mesh.m);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      units(shadow.map, under.map);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform1f(at.depthOnly, 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      floor.bind();
      gl.uniform1f(at.mode, 1);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
      gl.depthMask(true);
      body.bind();
      gl.uniform1f(at.mode, 0);
      gl.drawElements(gl.TRIANGLES, mesh.m, gl.UNSIGNED_SHORT, 0);
      path.load(dots);
      gl.disable(gl.DEPTH_TEST);
      gl.uniform1f(at.mode, 2);
      gl.drawElements(gl.TRIANGLES, dots.m, gl.UNSIGNED_SHORT, 0);
    },
  };
}
