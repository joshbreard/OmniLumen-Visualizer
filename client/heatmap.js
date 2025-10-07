import * as THREE from "three";

const _lightPos = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _direction = new THREE.Vector3();

export function createHeatmapPlane({ size = 25, resolution = 64 } = {}) {
  const geometry = new THREE.PlaneGeometry(size, size, resolution, resolution);

  const uniforms = {
    uLightPos: { value: new THREE.Vector3() },
    uLightDir: { value: new THREE.Vector3(0, -1, 0) },
    uCosHalfAngle: { value: Math.cos(THREE.MathUtils.degToRad(40)) },
    uIntensity: { value: 0 },
    uReferenceLux: { value: 150 },
    uMaxDistance: { value: 40 },
    uEnabled: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec3 vWorldPosition;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uLightPos;
      uniform vec3 uLightDir;
      uniform float uCosHalfAngle;
      uniform float uIntensity;
      uniform float uReferenceLux;
      uniform float uMaxDistance;
      uniform float uEnabled;

      varying vec3 vWorldPosition;

      vec3 gradient(float t) {
        const vec3 c0 = vec3(0.0, 0.1, 0.7);
        const vec3 c1 = vec3(0.0, 0.65, 0.35);
        const vec3 c2 = vec3(0.95, 0.82, 0.15);
        const vec3 c3 = vec3(1.0, 1.0, 1.0);
        if (t < 0.33) {
          float f = smoothstep(0.0, 0.33, t);
          return mix(c0, c1, f);
        } else if (t < 0.66) {
          float f = smoothstep(0.33, 0.66, t);
          return mix(c1, c2, f);
        }
        float f = smoothstep(0.66, 1.0, t);
        return mix(c2, c3, f);
      }

      void main() {
        if (uEnabled < 0.5) {
          discard;
        }

        vec3 toPoint = vWorldPosition - uLightPos;
        float distance = length(toPoint);
        if (distance > uMaxDistance) {
          discard;
        }

        vec3 lightToPoint = distance > 0.0 ? toPoint / distance : vec3(0.0);
        float coneStrength = smoothstep(uCosHalfAngle, uCosHalfAngle + 0.12, dot(lightToPoint, uLightDir));
        if (coneStrength <= 0.001) {
          discard;
        }

        float vertical = clamp(-lightToPoint.y, 0.0, 1.0);
        float lux = uIntensity * coneStrength * vertical / max(distance * distance, 0.5);

        float normalized = clamp(pow(lux / max(uReferenceLux, 0.0001), 0.42), 0.0, 1.0);
        vec3 color = gradient(normalized);
        float alpha = normalized * 0.85;

        if (alpha <= 0.002) {
          discard;
        }

        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.012;
  mesh.renderOrder = 2;
  mesh.name = "PhotometricHeatmap";
  return mesh;
}

export function updateHeatmapUniforms(mesh, { light, target, intensity, enabled }) {
  if (!mesh || !mesh.material || !mesh.material.uniforms) return;

  const uniforms = mesh.material.uniforms;
  uniforms.uEnabled.value = enabled ? 1 : 0;
  if (!enabled || !light || !target) {
    return;
  }

  light.getWorldPosition(_lightPos);
  target.getWorldPosition(_targetPos);
  _direction.copy(_targetPos).sub(_lightPos).normalize();

  uniforms.uLightPos.value.copy(_lightPos);
  uniforms.uLightDir.value.copy(_direction);
  uniforms.uCosHalfAngle.value = Math.cos(light.angle);
  uniforms.uIntensity.value = intensity;
  uniforms.uMaxDistance.value = Math.max(light.distance, 15);
  uniforms.uReferenceLux.value = Math.max(intensity / 12, 60);
}
