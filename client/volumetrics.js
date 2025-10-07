import * as THREE from "three";

const _origin = new THREE.Vector3();
const _target = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _down = new THREE.Vector3(0, -1, 0);
// Keep volumetric density/falloff readable at the current 10 m room scale.
const sceneScale = 1.0;

function applySceneScale(uniforms, { opacity, attenuation, noise }) {
  if (typeof opacity === "number" && uniforms.uOpacity) {
    uniforms.uOpacity.value = opacity * sceneScale;
  }
  if (typeof attenuation === "number" && uniforms.uAttenuation) {
    const scaled = Math.max(0.01, attenuation / sceneScale);
    uniforms.uAttenuation.value = scaled;
  }
  if (typeof noise === "number" && uniforms.uNoise) {
    uniforms.uNoise.value = noise;
  }
}

export function createVolumetricBeam(
  baseColor = new THREE.Color(1, 1, 1),
  {
    opacity = 0.4,
    attenuation = 0.08,
    noise = 0.0,
  } = {}
) {
  const geometry = new THREE.ConeGeometry(1, 1, 48, 1, true);
  geometry.translate(0, -0.5, 0);
  geometry.rotateX(Math.PI);

  const uniforms = {
    uColor: { value: baseColor.clone() },
    uIntensity: { value: 0.0 },
    uOpacity: { value: opacity },
    uAttenuation: { value: Math.max(0.01, attenuation) },
    uNoise: { value: noise },
  };

  applySceneScale(uniforms, { opacity, attenuation, noise });

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying float vHeight;
      varying float vRadial;

      void main() {
        vHeight = 1.0 - (position.y + 0.5);
        vRadial = length(position.xz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uOpacity;
      uniform float uAttenuation;
      uniform float uNoise;
      varying float vHeight;
      varying float vRadial;

      void main() {
        float rim = smoothstep(0.5, 1.0, vRadial);
        float axial = pow(clamp(vHeight, 0.0, 1.0), 1.2);
        // Exponential falloff approximates air particles absorbing light over distance.
        float falloff = exp(-vHeight / uAttenuation);
        float body = (1.0 - rim) * axial * falloff;
        float alpha = clamp(body * uIntensity * uOpacity, 0.0, 1.0);
        if (uNoise > 0.001) {
          // A light sinusoid simulates mild volumetric turbulence when enabled.
          float noiseSample = sin(vRadial * 25.0 + vHeight * 12.0) * 0.5 + 0.5;
          alpha *= mix(1.0, noiseSample, clamp(uNoise, 0.0, 1.0));
        }
        if (alpha <= 0.002) {
          discard;
        }
        vec3 color = uColor * (0.55 + 0.45 * (1.0 - vHeight));
        gl_FragColor = vec4(color * (uIntensity * uOpacity), alpha);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "VolumetricIESBeam";
  mesh.renderOrder = 3;
  return mesh;
}

export function updateVolumetricBeam({
  mesh,
  light,
  target,
  intensity,
  opacity,
  attenuation,
  noise,
}) {
  if (!mesh || !light || !target) return;

  light.getWorldPosition(_origin);
  target.getWorldPosition(_target);
  _direction.copy(_target).sub(_origin);
  const distance = Math.max(_direction.length(), 0.25);
  _direction.normalize();

  _quaternion.setFromUnitVectors(_down, _direction);
  mesh.setRotationFromQuaternion(_quaternion);

  const radius = Math.max(Math.tan(light.angle) * distance, 0.05);
  mesh.scale.set(radius, distance, radius);

  mesh.material.uniforms.uColor.value.copy(light.color);

  const baseCandela = 1500;
  const intensityFactor = THREE.MathUtils.clamp(intensity / baseCandela, 0, 12);
  const spreadFactor = THREE.MathUtils.clamp((Math.PI / 2 - light.angle) / (Math.PI / 2) + 0.35, 0.25, 1.6);
  const volumetricStrength = intensityFactor * spreadFactor;

  if (mesh.material?.uniforms) {
    applySceneScale(mesh.material.uniforms, { opacity, attenuation, noise });
  }

  mesh.material.uniforms.uIntensity.value = volumetricStrength;
  mesh.visible = volumetricStrength > 0.001;
}
