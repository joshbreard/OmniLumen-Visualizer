// CDN module imports for the Three.js runtime and controls.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
// Local photometry utilities that load IES files and derive light helpers.
import { loadIESLight, kelvinToRGB } from "./ies.js";

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

const ceilingHeight = 3.25;

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

// Simple lighting so the room is visible
const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0x6b7fa5, 1.4);
keyLight.position.set(-3.5, 2.2, -2.8);
keyLight.target.position.set(0, 1.5, 0);
scene.add(keyLight);
scene.add(keyLight.target);

// Rotating cube to keep original reference geometry
const referenceCube = new THREE.Mesh(
  new THREE.BoxGeometry(1.2, 1.2, 1.2),
  new THREE.MeshStandardMaterial({ color: 0x00aa5b, roughness: 0.5 })
);
referenceCube.position.set(-0.75, 0.6, -1.25);
scene.add(referenceCube);

let fixtures = [];

const lightRegistry = [];
let selectedLightId = "";

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
    };

    updateLightTarget(entry);
    applyLightIntensity(entry);
    applyLightColor(entry);
    helperUpdate();

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

function updateRangeLabels() {
  intensityValueEl.textContent = `${intensityRange.value}`;
  cctValueEl.textContent = `${cctRange.value}K`;
  yawValueEl.textContent = `${yawRange.value}°`;
  pitchValueEl.textContent = `${pitchRange.value}°`;
}

function applyLightIntensity(entry) {
  entry.light.intensity = entry.intensity;
}

function applyLightColor(entry) {
  const { r, g, b } = kelvinToRGB(entry.colorTemp);
  entry.light.color.setRGB(r, g, b);
  if (entry.helper && !entry.helper.isSpotLightHelper && entry.helper.material?.color) {
    entry.helper.material.color.setRGB(r, g, b);
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
});

pitchRange.addEventListener("input", () => {
  updateRangeLabels();
  const entry = getSelectedLight();
  if (!entry) return;
  entry.pitch = Number(pitchRange.value);
  updateLightTarget(entry);
  entry.updateHelper?.();
});

loadFixtures();
updateRangeLabels();
updateControlAvailability();

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  referenceCube.rotation.x += 0.003;
  referenceCube.rotation.y += 0.0045;
  room.rotation.y += 0.0006;

  for (const entry of lightRegistry) {
    if (entry.helper?.isSpotLightHelper) {
      entry.updateHelper?.();
    } else if (entry.helper) {
      entry.updateHelper?.();
    }
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