import * as THREE from 'three';

type LabelPosition = THREE.Vector3 | { x: number; y: number; z: number };

export function createTextLabel(text: string, position: LabelPosition, color = '#ffffff', scale: [number, number, number] = [4, 1, 1]) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create canvas context for text label');
  }

  canvas.width = 512;
  canvas.height = 128;

  context.fillStyle = color;
  context.font = 'Bold 40px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(spriteMaterial);

  sprite.renderOrder = 1000;
  sprite.scale.set(...scale);
  sprite.position.set(position.x, position.y, position.z);

  return sprite;
}
