import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';

console.log('Three.js script loaded successfully');

// Create the scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);
console.log('Scene created');

// Create the camera
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.z = 5;
console.log('Camera created and positioned');

// Create the renderer with error handling
let renderer;
try {
  const canvas = document.querySelector('#scene');
  console.log('Canvas element found:', canvas);
  
  renderer = new THREE.WebGLRenderer({ 
    canvas: canvas,
    antialias: true 
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  console.log('Renderer created successfully');
} catch (error) {
  console.error('Error creating WebGL renderer:', error);
  document.body.innerHTML = '<div style="color: white; padding: 20px; font-family: Arial;">WebGL not supported or failed to initialize. Error: ' + error.message + '</div>';
  throw error;
}

// Create the cube geometry and material
const geometry = new THREE.BoxGeometry();
const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);
console.log('Cube added to scene');

// Add lighting to make the cube visible
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(2, 2, 2);
scene.add(light);

// Add ambient light for better visibility
const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
scene.add(ambientLight);
console.log('Lights added to scene');

// Handle window resize
function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', handleResize);

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  
  // Rotate the cube
  cube.rotation.x += 0.01;
  cube.rotation.y += 0.01;
  
  // Render the scene
  renderer.render(scene, camera);
}

// Start the animation
console.log('Starting animation loop');
animate();
