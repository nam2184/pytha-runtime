import * as THREE from 'three';

const colors = [
  0xcccccc, 0x000000, 0xff0000, 0x00ff00, 0x0000ff, 0xffff00,
  0xff00ff, 0x00ffff, 0xffffff, 0xc0c0c0, 0x808080, 0x800000,
];

export function getMaterial(penIndex: number, transparentMode = false): THREE.Material {
  const material = new THREE.MeshStandardMaterial({
    color: colors[penIndex % colors.length],
    roughness: 0.5,
    metalness: 0.1,
  });
  applyMaterialMode(material, transparentMode);
  return material;
}

export function applyMaterialMode(material: THREE.Material, transparentMode: boolean) {
  material.transparent = transparentMode;
  material.opacity = transparentMode ? 0.35 : 1;
  material.depthWrite = !transparentMode;
  material.needsUpdate = true;
}
