// Three.js photometric helper utilities used by the application-side UI.
import * as THREE from "three";

// IESLoader disabled - using fallback parser only
function requestIESLoader() {
  return Promise.resolve(null);
}

export function kelvinToRGB(kelvin) {
  const temp = Math.max(1000, Math.min(40000, kelvin));
  const t = temp / 100;

  let r = 0;
  let g = 0;
  let b = 0;

  if (t <= 66) {
    r = 255;
    g = t;
    g = 99.4708025861 * Math.log(g) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }

  return {
    r: THREE.MathUtils.clamp(r / 255, 0, 1),
    g: THREE.MathUtils.clamp(g / 255, 0, 1),
    b: THREE.MathUtils.clamp(b / 255, 0, 1),
  };
}

export async function loadIESLight({
  iesPath,
  scene,
  position = [0, 3, 0],
  colorTempK = 3500,
  intensity = 1500,
}) {
  if (!iesPath) {
    throw new Error("Missing iesPath for loadIESLight");
  }

  const loaderModule = await requestIESLoader();
  if (loaderModule?.IESLoader || loaderModule?.default) {
    const IESLoaderClass = loaderModule.IESLoader ?? loaderModule.default;
    try {
      const loader = new IESLoaderClass();
      const iesTexture = await new Promise((resolve, reject) => {
        loader.load(iesPath, resolve, undefined, reject);
      });

      const light = createBaseSpotLight({ intensity, colorTempK, position });
      light.ies = iesTexture;
      light.userData.iesSource = iesPath;

      const helper = new THREE.SpotLightHelper(light);
      helper.userData.helperType = "spot";

      return { light, helper };
    } catch (error) {
      console.warn("IESLoader failed, using fallback parser instead.", error);
    }
  }

  return fallbackLoadIES({ iesPath, scene, position, colorTempK, intensity });
}

function createBaseSpotLight({ intensity, colorTempK, position }) {
  const light = new THREE.SpotLight(0xffffff, intensity);
  light.angle = THREE.MathUtils.degToRad(38);
  light.penumbra = 0.35;
  light.decay = 2;
  light.distance = 35;
  light.castShadow = false;

  if (Array.isArray(position) && position.length === 3) {
    light.position.set(position[0], position[1], position[2]);
    light.userData.originalPosition = new THREE.Vector3().fromArray(position);
  }

  const { r, g, b } = kelvinToRGB(colorTempK);
  light.color.setRGB(r, g, b);
  return light;
}

async function fallbackLoadIES({ iesPath, position, colorTempK, intensity }) {
  const iesText = await fetchIESFile(iesPath);
  const photometry = parseIESPhotometry(iesText);

  const light = createBaseSpotLight({ intensity, colorTempK, position });
  if (photometry.beamAngle) {
    light.angle = photometry.beamAngle;
  }
  if (photometry.suggestedDistance) {
    light.distance = photometry.suggestedDistance;
  }
  light.penumbra = 0.4;
  light.userData.iesSource = iesPath;
  light.userData.photometry = photometry;

  const beamMesh = createBeamMesh(light.color);
  beamMesh.userData.helperType = "beamMesh";
  beamMesh.userData.photometry = photometry;

  return { light, helper: beamMesh };
}

async function fetchIESFile(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to fetch IES file (${response.status})`);
  }
  return response.text();
}

function parseIESPhotometry(text) {
  const lines = text.split(/\r?\n/);
  const tiltLineIndex = lines.findIndex((line) => line.trim().toUpperCase().includes("TILT"));
  if (tiltLineIndex === -1) {
    return {};
  }

  const numericTokens = lines
    .slice(tiltLineIndex + 1)
    .join(" ")
    .trim()
    .split(/\s+/)
    .map((token) => Number.parseFloat(token))
    .filter((value) => Number.isFinite(value));

  if (numericTokens.length < 10) {
    return {};
  }

  let index = 0;
  const lampCount = numericTokens[index++];
  const lumensPerLamp = numericTokens[index++];
  const candelaMultiplier = numericTokens[index++];
  const numVerticalAngles = Math.max(0, Math.floor(numericTokens[index++]));
  const numHorizontalAngles = Math.max(0, Math.floor(numericTokens[index++]));
  index += 5; // Skip photometric type, units, width, length, height

  const verticalAngles = numericTokens.slice(index, index + numVerticalAngles);
  index += numVerticalAngles;
  const horizontalAngles = numericTokens.slice(index, index + numHorizontalAngles);
  index += numHorizontalAngles;
  const candelaCount = numVerticalAngles * numHorizontalAngles;
  const candelaValues = numericTokens.slice(index, index + candelaCount);

  if (!candelaValues.length) {
    return {};
  }

  const scaledCandela = candelaValues.map((value) => value * (candelaMultiplier || 1));
  const peakCandela = scaledCandela.reduce((max, value) => Math.max(max, value), 0);
  const halfPower = peakCandela * 0.5;

  const primarySlice = scaledCandela.slice(0, numVerticalAngles);
  let beamAngleDeg = 40;
  for (let i = 0; i < primarySlice.length; i += 1) {
    const value = primarySlice[i];
    const angle = verticalAngles[i] ?? 0;
    if (value < halfPower) {
      beamAngleDeg = angle;
      break;
    }
  }

  beamAngleDeg = THREE.MathUtils.clamp(beamAngleDeg || 40, 5, 120);

  const suggestedDistance = Math.max(10, (lumensPerLamp * lampCount) / 80 || 12);

  return {
    lampCount,
    lumensPerLamp,
    peakCandela,
    beamAngle: THREE.MathUtils.degToRad(beamAngleDeg),
    suggestedDistance,
    verticalAngles,
    horizontalAngles,
  };
}

function createBeamMesh(color) {
  const geometry = new THREE.ConeGeometry(1, 1, 36, 1, true);
  geometry.translate(0, -0.5, 0);
  geometry.rotateX(Math.PI);

  const material = new THREE.MeshBasicMaterial({
    color: color.clone(),
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "IESBeamHelper";
  return mesh;
}