import * as THREE from 'three';

// The view out of the window, drawn by a small shader so it can follow the
// story clock: at 19:00 there is still a band of dusk on the horizon, by 23:30
// it is full night, more stars are out and most of the lit windows across the
// street have gone dark. It is the one thing in the room that is not baked.
//
// Colours are written straight out in sRGB, like the baked textures, so the
// sky sits in the same colour world as the room around it.

// UVs are worked out from the pane's own bounds rather than read from the
// file: the optimiser drops texture coordinates nothing seems to use.
const vertex = /* glsl */`
  uniform vec2 uMin;
  uniform vec2 uSize;
  varying vec2 vUv;
  void main() {
    vUv = (position.xy - uMin) / uSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = /* glsl */`
  varying vec2 vUv;
  uniform float uNight;     // 0 at the start of the evening, 1 at the end
  uniform float uTime;
  uniform float uAspect;    // pane width / height
  uniform vec3 uDusk;       // horizon colour at the start
  uniform vec3 uZenith;     // top of the sky at the start
  uniform vec3 uNightSky;   // the whole sky at the end
  uniform float uSkyline;   // 1 draws a city skyline

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    float h = vUv.y;
    vec3 zenith = mix(uZenith, uNightSky * 0.7, uNight);
    vec3 horizon = mix(uDusk, uNightSky * 1.35, smoothstep(0.0, 0.7, uNight));
    vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.9, h));

    // Stars: more of them as it gets later, gently twinkling.
    vec2 g = floor(vUv * vec2(90.0 * uAspect, 90.0));
    float r = hash(g);
    float starOn = step(0.985 - uNight * 0.012, r) * smoothstep(0.35, 0.9, h);
    col += starOn * (0.35 + 0.35 * uNight) * (0.75 + 0.25 * sin(uTime * 1.7 + r * 60.0));

    // The moon, high in the corner.
    vec2 m = (vUv - vec2(0.78, 0.8)) * vec2(uAspect, 1.0);
    float md = length(m);
    col += smoothstep(0.075, 0.068, md) * vec3(0.98, 0.95, 0.85);
    col += smoothstep(0.35, 0.0, md) * 0.07;

    if (uSkyline > 0.5) {
      // Rooftops across the street, each with a grid of windows. A window's
      // own random number decides at what time it goes dark.
      float x = vUv.x * uAspect * 9.0;
      float bx = floor(x);
      float roof = 0.1 + hash(vec2(bx, 3.0)) * 0.26;
      if (h < roof) {
        col = vec3(0.045, 0.05, 0.08) + hash(vec2(bx, 9.0)) * 0.02;
        vec2 cell = vec2(fract(x) * 5.0, h * 70.0);
        vec2 id = floor(cell) + vec2(bx * 13.0, 0.0);
        vec2 f = fract(cell);
        float lateness = hash(id);
        float lit = step(uNight * 0.85, lateness) * step(0.45, hash(id + 7.0));
        float pane = step(0.2, f.x) * step(f.x, 0.8) * step(0.25, f.y) * step(f.y, 0.75);
        vec3 warm = mix(vec3(1.0, 0.78, 0.45), vec3(0.75, 0.85, 1.0), step(0.8, hash(id + 3.0)));
        col += lit * pane * warm * 0.75;
      }
    }

    // A faint reflection across the glass.
    col += 0.035 * smoothstep(0.6, 1.0, 1.0 - abs(vUv.x - vUv.y * 0.6 - 0.1));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function makeSky(mesh, options = {}) {
  const box = new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position);
  const size = box.getSize(new THREE.Vector3());
  const scale = mesh.getWorldScale(new THREE.Vector3());
  const w = Math.abs(size.x * scale.x) || 1;
  const h = Math.abs(size.y * scale.y) || 1;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMin: { value: new THREE.Vector2(box.min.x, box.min.y) },
      uSize: { value: new THREE.Vector2(size.x || 1, size.y || 1) },
      uNight: { value: 0 },
      uTime: { value: 0 },
      uAspect: { value: w / h },
      uDusk: { value: new THREE.Color(options.dusk || '#e98a5c') },
      uZenith: { value: new THREE.Color(options.zenith || '#1f2d6b') },
      uNightSky: { value: new THREE.Color(options.night || '#0a1030') },
      uSkyline: { value: options.skyline === false ? 0 : 1 }
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    toneMapped: false
  });
  // Uniform colours are read as linear by three; ours are meant as sRGB
  // values written straight out, so undo the conversion.
  for (const k of ['uDusk', 'uZenith', 'uNightSky']) material.uniforms[k].value.convertLinearToSRGB();
  if (mesh.material) mesh.material.dispose();
  mesh.material = material;
  mesh.visible = true;
  return {
    material,
    update(night, time) {
      material.uniforms.uNight.value = night;
      material.uniforms.uTime.value = time;
    }
  };
}
