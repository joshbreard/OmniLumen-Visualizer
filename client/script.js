// CDN module imports for the Three.js runtime and controls.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
// Local photometry utilities that load IES files and derive light helpers.
import { loadIESLight, kelvinToRGB } from "./ies.js";
import { createVolumetricBeam, updateVolumetricBeam } from "./volumetrics.js";
import { createHeatmapPlane, updateHeatmapUniforms } from "./heatmap.js";

const viewportEl = document.getElementById("viewport");
const fixtureListEl = document.getElementById("fixture-list");
const searchInputEl = document.getElementById("fixture-search");
const selectedLightSelect = document.getElementById("selected-light");
const intensityRange = document.getElementById("intensity-range");
const cctRange = document.getElementById("cct-range");
const yawRange = document.getElementById("yaw-range");
const pitchRange = document.getElementById("pitch-range");
const intensityValueEl = document.getElementById("intensity-value");
const cctValueEl = document.getElementById("cct-value");
const yawValueEl = document.getElementById("yaw-value");
const pitchValueEl = document.getElementById("pitch-value");
const volumetricsToggle = document.getElementById("volumetrics-toggle");
const heatmapToggle = document.getElementById("heatmap-toggle");
const environmentSelect = document.getElementById("environment-select");
const volumetricDensityRange = document.getElementById("volumetric-density");
const volumetricFalloffRange = document.getElementById("volumetric-falloff");
const volumetricDensityValueEl = document.getElementById("volumetric-density-value");
const volumetricFalloffValueEl = document.getElementById("volumetric-falloff-value");

let volumetricDensityDefault = Number(volumetricDensityRange?.value ?? 0.4);
let volumetricFalloffDefault = Number(volumetricFalloffRange?.value ?? 0.08);

let volumetricDensityDefault = Number(volumetricDensityRange?.value ?? 0.4);
let volumetricFalloffDefault = Number(volumetricFalloffRange?.value ?? 0.08);

const ceilingHeight = 3.0;

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f1a);

// Camera setup
const camera = new THREE.PerspectiveCamera(
  50,
  viewportEl.clientWidth / viewportEl.clientHeight,
  0.1,
  200
);
camera.position.set(4.2, 3.1, 6.4);

// Renderer setup
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = false;
renderer.physicallyCorrectLights = true;
resizeRenderer();
viewportEl.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.2, 0);
controls.target.set(0, 1.1, 0);

// Create a cube room (inverted box)
const roomSize = 10;
const roomGeometry = new THREE.BoxGeometry(roomSize, roomSize, roomSize);
const roomMaterial = new THREE.MeshStandardMaterial({
  color: 0x1b263b,
  side: THREE.BackSide,
  roughness: 0.85,
  metalness: 0.05,
});
const room = new THREE.Mesh(roomGeometry, roomMaterial);
scene.add(room);

// Ground plane for reference
const groundGeometry = new THREE.PlaneGeometry(25, 25);
const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0x0f172a,
  roughness: 0.95,
  metalness: 0.01,
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;
scene.add(ground);

const heatmapPlane = createHeatmapPlane({ size: 25, resolution: 96 });
heatmapPlane.visible = false;
scene.add(heatmapPlane);

// Ceiling reference disk
const ceilingGeometry = new THREE.CircleGeometry(3.5, 48);
const ceilingMaterial = new THREE.MeshBasicMaterial({
  color: 0x294166,
  transparent: true,
  opacity: 0.45,
  side: THREE.DoubleSide,
});
const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
ceiling.rotation.x = Math.PI / 2;
ceiling.position.y = ceilingHeight;
scene.add(ceiling);

const emptyEnvironment = createEmptyEnvironment();
const roomEnvironment = createRoomEnvironment();
scene.add(emptyEnvironment);
scene.add(roomEnvironment);

let environmentMode = environmentSelect?.value ?? "empty";
setEnvironmentMode(environmentMode);

const heatmapPlane = createHeatmapPlane({ size: 25, resolution: 96 });
heatmapPlane.visible = false;
scene.add(heatmapPlane);

// Subtle ambient to keep the environment readable without overpowering photometric lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.12);
scene.add(ambientLight);

// Rotating cube to keep original reference geometry
const referenceCube = new THREE.Mesh(
  new THREE.BoxGeometry(1.2, 1.2, 1.2),
  new THREE.MeshStandardMaterial({ color: 0x00aa5b, roughness: 0.5 })
);
referenceCube.position.set(0, 0.6, 0);
scene.add(referenceCube);

let fixtures = [];

const lightRegistry = [];
let selectedLightId = "";
let volumetricsEnabled = false;
let heatmapEnabled = false;

function createEmptyEnvironment() {
  const group = new THREE.Group();
  group.name = "EmptyEnvironment";

  const shellSize = 12;
  const shellGeometry = new THREE.BoxGeometry(shellSize, shellSize, shellSize);
  const shellMaterial = new THREE.MeshStandardMaterial({
    color: 0x1b263b,
    side: THREE.BackSide,
    roughness: 0.85,
    metalness: 0.05,
  });
  const shell = new THREE.Mesh(shellGeometry, shellMaterial);
  shell.receiveShadow = true;
  group.add(shell);

  const groundGeometry = new THREE.PlaneGeometry(25, 25);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.95,
    metalness: 0.02,
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  group.add(ground);

  const ceilingGeometry = new THREE.CircleGeometry(3.5, 48);
  const ceilingMaterial = new THREE.MeshBasicMaterial({
    color: 0x294166,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
  });
  const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ceilingHeight;
  group.add(ceiling);

  return group;
}

function createRoomEnvironment() {
  const group = new THREE.Group();
  group.name = "RoomEnvironment";

  const width = 5;
  const depth = 5;
  const height = 3;

  const floorMaterial = new THREE.MeshPhongMaterial({
    color: 0x2a2c30,
    shininess: 8,
    specular: new THREE.Color(0x111111),
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const wallMaterial = new THREE.MeshPhongMaterial({
    color: 0xd8dadf,
    shininess: 12,
    specular: new THREE.Color(0x202020),
    side: THREE.DoubleSide,
  });

  const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), wallMaterial);
  frontWall.position.set(0, height / 2, -depth / 2);
  frontWall.rotation.y = Math.PI;
  frontWall.receiveShadow = true;
  group.add(frontWall);

  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), wallMaterial.clone());
  backWall.position.set(0, height / 2, depth / 2);
  backWall.receiveShadow = true;
  group.add(backWall);

  const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), wallMaterial.clone());
  rightWall.position.set(width / 2, height / 2, 0);
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.receiveShadow = true;
  group.add(rightWall);

  const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), wallMaterial.clone());
  leftWall.position.set(-width / 2, height / 2, 0);
  leftWall.rotation.y = Math.PI / 2;
  leftWall.receiveShadow = true;
  group.add(leftWall);

  const ceilingMaterial = new THREE.MeshPhongMaterial({
    color: 0xe2e3e6,
    shininess: 18,
    specular: new THREE.Color(0x292929),
    side: THREE.DoubleSide,
  });
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), ceilingMaterial);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = height;
  ceiling.receiveShadow = true;
  group.add(ceiling);

  const panelMaterial = new THREE.MeshPhongMaterial({
    color: 0xf4f5f7,
    shininess: 22,
    specular: new THREE.Color(0x3a3a3a),
    side: THREE.DoubleSide,
  });
  const ceilingPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.6, depth * 0.6),
    panelMaterial
  );
  ceilingPanel.rotation.x = Math.PI / 2;
  ceilingPanel.position.y = height - 0.02;
  ceilingPanel.receiveShadow = true;
  group.add(ceilingPanel);

  group.visible = false;
  return group;
}

function setEnvironmentMode(mode) {
  environmentMode = mode === "room" ? "room" : "empty";
  emptyEnvironment.visible = environmentMode === "empty";
  roomEnvironment.visible = environmentMode === "room";
}

function renderFixtures(list) {
  fixtureListEl.innerHTML = "";

  if (!list.length) {
    const emptyState = document.createElement("li");
    emptyState.id = "fixture-empty-state";
    emptyState.textContent = "No fixtures found. Try a different search.";
    fixtureListEl.appendChild(emptyState);
    return;
  }

  for (const fixture of list) {
    const item = document.createElement("li");
    item.className = "fixture-card";

    const title = document.createElement("h2");
    title.textContent = fixture.name ?? "Unnamed fixture";
    item.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "fixture-meta";

    const modeLabel = document.createElement("span");
    modeLabel.textContent = `Mode: ${fixture.mode ?? fixture.outputType ?? "—"}`;
    meta.appendChild(modeLabel);

    if (fixture.wattage !== undefined) {
      const wattLabel = document.createElement("span");
      wattLabel.textContent = `${fixture.wattage}W`;
      meta.appendChild(wattLabel);
    }

    const outputLabel = document.createElement("span");
    outputLabel.textContent = fixture.outputType
      ? `Output: ${fixture.outputType}`
      : "Output: —";
    meta.appendChild(outputLabel);

    item.appendChild(meta);

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Add to Scene";
    // Button handler wires the UI to the IES loader helper module.
    button.addEventListener("click", () => handleAddFixture(fixture));
    item.appendChild(button);

    fixtureListEl.appendChild(item);
  }
}

function filterFixtures(query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return fixtures;
  }

  return fixtures.filter((fixture) => {
    const name = fixture.name?.toLowerCase() ?? "";
    const mode = fixture.mode?.toLowerCase() ?? fixture.outputType?.toLowerCase() ?? "";
    return name.includes(normalized) || mode.includes(normalized);
  });
}

async function handleAddFixture(fixture) {
  if (!fixture?.iesPath) {
    console.warn("Fixture is missing an iesPath", fixture);
    return;
  }

  try {
    const initialIntensity = Number(intensityRange.value);
    const initialCCT = Number(cctRange.value);

    const { light, helper } = await loadIESLight({
      iesPath: fixture.iesPath,
      scene,
      position: [0, ceilingHeight, 0],
      colorTempK: initialCCT,
      intensity: initialIntensity,
    });

    const anchor = new THREE.Object3D();
    const sourcePosition = light.userData.originalPosition ?? new THREE.Vector3(0, ceilingHeight, 0);
    anchor.position.copy(sourcePosition);
    scene.add(anchor);

    anchor.add(light);
    light.position.set(0, 0, 0);

    const target = new THREE.Object3D();
    anchor.add(target);
    light.target = target;

    let helperObject = helper;
    let helperUpdate = () => {};

    if (helperObject) {
      if (helperObject.isSpotLightHelper) {
        helperObject.userData.helperType = "spot";
        scene.add(helperObject);
        helperUpdate = () => {
          helperObject.update();
        };
      } else {
        helperObject.userData.helperType = "beamMesh";
        helperObject.position.set(0, 0, 0);
        anchor.add(helperObject);
        helperUpdate = () => {
          const direction = computeLightDirection(light, target);
          const quaternion = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, -1, 0),
            direction
          );
          helperObject.setRotationFromQuaternion(quaternion);

          const origin = new THREE.Vector3();
          light.getWorldPosition(origin);
          const targetWorld = new THREE.Vector3();
          target.getWorldPosition(targetWorld);
          const distance = Math.max(origin.distanceTo(targetWorld), 0.25);
          const radius = Math.max(Math.tan(light.angle) * distance, 0.1);
          helperObject.scale.set(radius, distance, radius);
        };
      }
    }

    const id = `light-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    const entry = {
      id,
      fixture,
      anchor,
      light,
      helper: helperObject,
      updateHelper: helperUpdate,
      target,
      yaw: Number(yawRange.value),
      pitch: Number(pitchRange.value),
      intensity: initialIntensity,
      colorTemp: initialCCT,
      volumetricMesh: null,
      volumetricParams: {
        opacity: volumetricDensityDefault,
        attenuation: volumetricFalloffDefault,
        noise: 0,
      },
    };

    entry.updateVolumetric = () => {
      if (!entry.volumetricMesh || !entry.volumetricMesh.visible) {
        return;
      }
      updateVolumetricBeam({
        mesh: entry.volumetricMesh,
        light: entry.light,
        target: entry.target,
        intensity: entry.intensity,
        opacity: entry.volumetricParams.opacity,
        attenuation: entry.volumetricParams.attenuation,
        noise: entry.volumetricParams.noise,
      });
    };

    updateLightTarget(entry);
    applyLightIntensity(entry);
    applyLightColor(entry);
    helperUpdate();

    if (volumetricsEnabled) {
      ensureVolumetric(entry);
    }

    lightRegistry.push(entry);
    addLightOption(entry);
    setSelectedLight(id);
    console.log(`Added ${fixture.name ?? "fixture"} to the scene.`);
  } catch (error) {
    console.error("Error adding fixture to the scene", error);
  }
}

async function loadFixtures() {
  try {
    showLoadingState();
    const response = await fetch("./fixtures/fixtures.json");
    if (!response.ok) {
      throw new Error(`Failed to fetch fixtures (${response.status})`);
    }

    const data = await response.json();
    fixtures = Array.isArray(data) ? data : data.fixtures ?? [];
    renderFixtures(fixtures);
  } catch (error) {
    console.error("Unable to load fixtures", error);
    fixtureListEl.innerHTML = "";
    const errorState = document.createElement("li");
    errorState.id = "fixture-empty-state";
    errorState.textContent = "Failed to load fixtures. Check the console for details.";
    fixtureListEl.appendChild(errorState);
  }
}

function showLoadingState() {
  fixtureListEl.innerHTML = "";
  const loadingState = document.createElement("li");
  loadingState.id = "fixture-empty-state";
  loadingState.textContent = "Loading fixtures...";
  fixtureListEl.appendChild(loadingState);
}

function addLightOption(entry) {
  if (!selectedLightSelect.querySelector("option[value='']")) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.disabled = true;
    placeholder.textContent = "Select a light";
    selectedLightSelect.prepend(placeholder);
  }

  const option = document.createElement("option");
  option.value = entry.id;
  const index = lightRegistry.length;
  option.textContent = `${entry.fixture.name ?? "Light"} (#${index})`;
  selectedLightSelect.appendChild(option);
  updateControlAvailability();
}

function setSelectedLight(id) {
  selectedLightId = id;
  if (selectedLightSelect.value !== id) {
    selectedLightSelect.value = id;
  }
  updateControlAvailability();
  syncControlsToSelectedLight();
  syncVolumetricControls();
  updateHeatmapForSelected();
}

function getSelectedLight() {
  return lightRegistry.find((entry) => entry.id === selectedLightId) ?? null;
}

function syncControlsToSelectedLight() {
  const entry = getSelectedLight();
  if (!entry) {
    intensityRange.value = String(intensityRange.defaultValue ?? 1500);
    cctRange.value = String(cctRange.defaultValue ?? 3500);
    yawRange.value = String(yawRange.defaultValue ?? 0);
    pitchRange.value = String(pitchRange.defaultValue ?? -90);
    updateRangeLabels();
    return;
  }

  intensityRange.value = String(entry.intensity);
  cctRange.value = String(entry.colorTemp);
  yawRange.value = String(entry.yaw);
  pitchRange.value = String(entry.pitch);
  updateRangeLabels();
}

function syncVolumetricControls() {
  const entry = getSelectedLight();
  if (!volumetricDensityRange || !volumetricFalloffRange) return;

  if (!entry) {
    volumetricDensityRange.value = volumetricDensityRange.defaultValue ?? "0.4";
    volumetricFalloffRange.value = volumetricFalloffRange.defaultValue ?? "0.08";
  } else {
    const density = entry.volumetricParams?.opacity ?? volumetricDensityDefault;
    const falloff = entry.volumetricParams?.attenuation ?? volumetricFalloffDefault;
    volumetricDensityRange.value = density.toFixed(2);
    volumetricFalloffRange.value = falloff.toFixed(2);
  }

  volumetricDensityDefault = Number(volumetricDensityRange.value);
  volumetricFalloffDefault = Number(volumetricFalloffRange.value);
  updateVolumetricRangeLabels();
  updateVolumetricSliderState();
}

function updateControlAvailability() {
  const hasLights = lightRegistry.length > 0;
  selectedLightSelect.disabled = !hasLights;
  intensityRange.disabled = !hasLights;
  cctRange.disabled = !hasLights;
  yawRange.disabled = !hasLights;
  pitchRange.disabled = !hasLights;

  if (!hasLights) {
    selectedLightSelect.value = "";
  }
}

function updateVolumetricSliderState() {
  if (!volumetricDensityRange || !volumetricFalloffRange) return;
  const entry = getSelectedLight();
  const enabled = Boolean(volumetricsEnabled && entry);
  volumetricDensityRange.disabled = !enabled;
  volumetricFalloffRange.disabled = !enabled;
}

function updateRangeLabels() {
  intensityValueEl.textContent = `${intensityRange.value}`;
  cctValueEl.textContent = `${cctRange.value}K`;
  yawValueEl.textContent = `${yawRange.value}°`;
  pitchValueEl.textContent = `${pitchRange.value}°`;
}

function updateVolumetricRangeLabels() {
  if (!volumetricDensityRange || !volumetricFalloffRange) return;
  if (volumetricDensityValueEl) {
    volumetricDensityValueEl.textContent = Number(volumetricDensityRange.value).toFixed(2);
  }
  if (volumetricFalloffValueEl) {
    volumetricFalloffValueEl.textContent = Number(volumetricFalloffRange.value).toFixed(2);
  }
}

function applyLightIntensity(entry) {
  entry.light.intensity = entry.intensity;
  entry.updateVolumetric?.();
  if (entry.id === selectedLightId) {
    updateHeatmapForSelected();
  }
}

function applyLightColor(entry) {
  const { r, g, b } = kelvinToRGB(entry.colorTemp);
  entry.light.color.setRGB(r, g, b);
  if (entry.helper && !entry.helper.isSpotLightHelper && entry.helper.material?.color) {
    entry.helper.material.color.setRGB(r, g, b);
  }
  entry.updateVolumetric?.();
  if (entry.id === selectedLightId) {
    updateHeatmapForSelected();
  }
}

function updateLightTarget(entry) {
  const yawRad = THREE.MathUtils.degToRad(entry.yaw);
  const pitchRad = THREE.MathUtils.degToRad(entry.pitch);
  const cosPitch = Math.cos(pitchRad);
  const direction = new THREE.Vector3(
    Math.sin(yawRad) * cosPitch,
    Math.sin(pitchRad),
    Math.cos(yawRad) * cosPitch
  ).normalize();

  const distance = computeTargetDistance(entry.anchor, direction);
  entry.target.position.set(
    direction.x * distance,
    direction.y * distance,
    direction.z * distance
  );
  entry.light.distance = Math.max(distance * 1.2, 5);
  entry.light.target.updateMatrixWorld();
  if (entry.id === selectedLightId) {
    updateHeatmapForSelected();
  }
}

function computeTargetDistance(anchor, direction) {
  const origin = new THREE.Vector3();
  anchor.getWorldPosition(origin);

  let distance = 5;
  if (direction.y < -0.0001) {
    distance = origin.y / -direction.y;
  } else if (Math.abs(direction.y) < 0.0001) {
    distance = 10;
  } else {
    distance = 3;
  }
  return Math.max(distance, 0.5);
}

function computeLightDirection(light, target) {
  const origin = new THREE.Vector3();
  light.getWorldPosition(origin);
  const targetWorld = new THREE.Vector3();
  target.getWorldPosition(targetWorld);
  return targetWorld.sub(origin).normalize();
}

function ensureVolumetric(entry) {
  if (!entry) return;
  if (!entry.volumetricMesh) {
    const mesh = createVolumetricBeam(entry.light.color, entry.volumetricParams);
    const mesh = createVolumetricBeam(entry.light.color);
    mesh.visible = volumetricsEnabled;
    entry.anchor.add(mesh);
    entry.volumetricMesh = mesh;
  } else {
    entry.volumetricMesh.visible = volumetricsEnabled;
  }
  entry.updateVolumetric?.();
}

function updateHeatmapForSelected() {
  if (!heatmapPlane) return;
  const entry = getSelectedLight();
  const shouldShow = Boolean(heatmapEnabled && entry);
  heatmapPlane.visible = shouldShow;
  updateHeatmapUniforms(heatmapPlane, {
    light: entry?.light ?? null,
    target: entry?.target ?? null,
    intensity: entry?.intensity ?? 0,
    enabled: shouldShow,
  });
}

searchInputEl.addEventListener("input", (event) => {
  const filtered = filterFixtures(event.target.value);
  renderFixtures(filtered);
});

selectedLightSelect.addEventListener("change", (event) => {
  setSelectedLight(event.target.value);
});

intensityRange.addEventListener("input", () => {
  updateRangeLabels();
  const entry = getSelectedLight();
  if (!entry) return;
  entry.intensity = Number(intensityRange.value);
  applyLightIntensity(entry);
});

cctRange.addEventListener("input", () => {
  updateRangeLabels();
  const entry = getSelectedLight();
  if (!entry) return;
  entry.colorTemp = Number(cctRange.value);
  applyLightColor(entry);
});

yawRange.addEventListener("input", () => {
  updateRangeLabels();
  const entry = getSelectedLight();
  if (!entry) return;
  entry.yaw = Number(yawRange.value);
  updateLightTarget(entry);
  entry.updateHelper?.();
  entry.updateVolumetric?.();
  updateHeatmapForSelected();
});

pitchRange.addEventListener("input", () => {
  updateRangeLabels();
  const entry = getSelectedLight();
  if (!entry) return;
  entry.pitch = Number(pitchRange.value);
  updateLightTarget(entry);
  entry.updateHelper?.();
  entry.updateVolumetric?.();
  updateHeatmapForSelected();
});

environmentSelect?.addEventListener("change", (event) => {
  setEnvironmentMode(event.target.value);
});

volumetricsToggle?.addEventListener("change", (event) => {
  volumetricsEnabled = Boolean(event.target.checked);
  for (const entry of lightRegistry) {
    if (volumetricsEnabled) {
      ensureVolumetric(entry);
    } else if (entry.volumetricMesh) {
      entry.volumetricMesh.visible = false;
    }
  }
  updateVolumetricSliderState();
  const entry = getSelectedLight();
  if (volumetricsEnabled && entry) {
    entry.updateVolumetric?.();
  }
});

heatmapToggle?.addEventListener("change", (event) => {
  heatmapEnabled = Boolean(event.target.checked);
  updateHeatmapForSelected();
});

volumetricDensityRange?.addEventListener("input", () => {
  volumetricDensityDefault = Number(volumetricDensityRange.value);
  updateVolumetricRangeLabels();
  const entry = getSelectedLight();
  if (!entry || !volumetricsEnabled) return;
  entry.volumetricParams.opacity = volumetricDensityDefault;
  ensureVolumetric(entry);
  entry.updateVolumetric?.();
});

volumetricFalloffRange?.addEventListener("input", () => {
  volumetricFalloffDefault = Number(volumetricFalloffRange.value);
  updateVolumetricRangeLabels();
  const entry = getSelectedLight();
  if (!entry || !volumetricsEnabled) return;
  entry.volumetricParams.attenuation = volumetricFalloffDefault;
  ensureVolumetric(entry);
  entry.updateVolumetric?.();
});

loadFixtures();
updateRangeLabels();
updateControlAvailability();
updateHeatmapForSelected();
updateVolumetricRangeLabels();
updateVolumetricSliderState();

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  referenceCube.rotation.x += 0.003;
  referenceCube.rotation.y += 0.0045;

  for (const entry of lightRegistry) {
    if (entry.helper?.isSpotLightHelper) {
      entry.updateHelper?.();
    } else if (entry.helper) {
      entry.updateHelper?.();
    }
    entry.updateVolumetric?.();
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();

// Handle resizing
window.addEventListener("resize", () => {
  resizeRenderer();
  camera.aspect = viewportEl.clientWidth / viewportEl.clientHeight;
  camera.updateProjectionMatrix();
});

function resizeRenderer() {
  const width = viewportEl.clientWidth || window.innerWidth;
  const height = viewportEl.clientHeight || window.innerHeight;
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}