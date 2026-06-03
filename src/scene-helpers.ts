import * as THREE from 'three';

const GRID_SIZE = 5000;
const GRID_DIVISIONS = 500;
const GRID_HALF = GRID_SIZE / 2;

export const POSITIVE_AXIS_LENGTH = GRID_HALF;

function createAxisLine(start: THREE.Vector3, end: THREE.Vector3, color: number) {
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const material = new THREE.LineBasicMaterial({
    color,
    depthTest: false,
    depthWrite: false,
  });
  const line = new THREE.Line(geometry, material);
  line.renderOrder = 1000;
  return line;
}

export function createAxisHelpers() {
  const group = new THREE.Group();
  group.renderOrder = 998;

  const xAxis = createAxisLine(new THREE.Vector3(0, 0, 0), new THREE.Vector3(GRID_HALF, 0, 0), 0xff0000);
  const yAxis = createAxisLine(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, GRID_HALF), 0x00ff00);
  const zAxis = createAxisLine(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, GRID_HALF, 0), 0x0000ff);
  group.add(xAxis, yAxis, zAxis);

  return group;
}

export function createGridHelper() {
  const group = new THREE.Group();
  group.renderOrder = 999;

  const xzGrid = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS, 0xffffff, 0xcccccc);
  const xzMaterial = xzGrid.material as THREE.Material;
  xzMaterial.depthTest = false;
  xzMaterial.depthWrite = false;
  xzMaterial.transparent = true;
  xzMaterial.opacity = 0.5;
  group.add(xzGrid);

  return group;
}

export function addSceneHelpers(scene: THREE.Scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 1));

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(100, 100, 100);
  scene.add(directionalLight);

  scene.add(createGridHelper());
  scene.add(createAxisHelpers());
}
