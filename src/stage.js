// Draws a mesh from body.js with WebGL 2: one key light with soft shadows, a
// floor that catches them, and a rim so limbs stand apart. Nothing is loaded.
import { STRIDE } from './body.js';

const VERT = `#version 300 es
layout(location=0) in vec3 p; layout(location=1) in vec3 n; layout(location=2) in vec4 c;
uniform mat4 view, light; uniform float depthOnly;
out vec3 P, N; out vec4 K; out vec4 S;
void main() {
  P = p; N = n; K = c; S = light * vec4(p + n * .6, 1.);
  gl_Position = depthOnly > .5 ? light * vec4(p, 1.) : view * vec4(p, 1.);
}`;
const FRAG = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 P, N; in vec4 K; in vec4 S;
uniform vec3 eye, key; uniform sampler2DShadow map; uniform float mode, dark, reach; uniform vec2 middle, size;
out vec4 o;
float lit() {
  vec3 q = S.xyz / S.w * .5 + .5; q.z -= .0015;
  float s = 0.;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) s += texture(map, vec3(q.xy + vec2(x, y) * .0011, q.z));
  return s / 9.;
}
void main() {
  if (mode > 1.5) { o = vec4(K.rgb, 1.); return; }
  float s = lit();
  if (mode > .5) {
    float away = length(P.xz - middle) / reach;
    vec2 rim = gl_FragCoord.xy / size;
    float fade = smoothstep(1., .5, away) * smoothstep(0., .16, rim.y) * smoothstep(0., .1, rim.x) * smoothstep(1., .9, rim.x);
    if (dark > .5) { vec3 f = vec3(.085, .092, .108) * (.45 + .55 * s); o = vec4(f * fade, fade); }
    else { float a = (1. - s) * .2 * fade; o = vec4(vec3(.05, .07, .12) * a, a); }
    return;
  }
  vec3 n = normalize(N), v = normalize(eye - P);
  vec3 base = pow(K.rgb, vec3(2.2));
  float d = max(dot(n, key), 0.);
  float side = .5 + .5 * dot(n, normalize(vec3(-key.x, .15, -key.z)));
  float sky = .5 + .5 * n.y;
  vec3 c = base * (vec3(.30, .32, .37) * mix(.55, 1.1, sky) + vec3(.16, .17, .2) * side + vec3(1.02, .98, .93) * d * mix(.12, 1., s));
  float rim = pow(1. - max(dot(n, v), 0.), 3.);
  c += rim * (dark > .5 ? vec3(.22, .25, .32) : vec3(.10, .11, .13)) * (.4 + .6 * sky);
  c += K.a * pow(max(dot(n, normalize(key + v)), 0.), 26.) * s * .55;
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
  const at = Object.fromEntries(['view', 'light', 'depthOnly', 'eye', 'key', 'map', 'mode', 'dark', 'reach', 'middle', 'size'].map((n) => [n, gl.getUniformLocation(program, n)]));

  const SHADOW = 1024;
  const map = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, map);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SHADOW, SHADOW, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE], [gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const target = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, target);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, map, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const buffer = () => {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    for (const [i, size, offset] of [[0, 3, 0], [1, 3, 3], [2, 4, 6]]) {
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
    v: new Float32Array([[-F, -F], [F, -F], [F, F], [-F, F]].flatMap(([x, z]) => [x, 0, z, 0, 1, 0, 1, 1, 1, 0])),
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

      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.viewport(0, 0, SHADOW, SHADOW);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.uniform1f(at.depthOnly, 1);
      gl.uniform1f(at.mode, 2);
      gl.drawElements(gl.TRIANGLES, mesh.m, gl.UNSIGNED_SHORT, 0);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, map);
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
