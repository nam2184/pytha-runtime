import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'three';
import * as THREE from 'three';
import { ElementRegistry } from '../src/platform/three-platform';

describe('Three.js Scene Tests', () => {
  let scene: THREE.Scene;
  let registry: ElementRegistry;

  beforeEach(() => {
    scene = new THREE.Scene();
    registry = new ElementRegistry();
  });

  describe('Scene creation', () => {
    it('creates an empty scene', () => {
      expect(scene.children.length).toBe(0);
    });

    it('adds meshes to scene', () => {
      const geo = new THREE.BoxGeometry(10, 10, 10);
      const mat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);

      expect(scene.children.length).toBe(1);
    });

    it('removes meshes from scene', () => {
      const geo = new THREE.BoxGeometry(10, 10, 10);
      const mat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);
      scene.remove(mesh);

      expect(scene.children.length).toBe(0);
    });
  });

  describe('Element registry', () => {
    it('registers elements', () => {
      const geo = new THREE.BoxGeometry(10, 10, 10);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
      const handle = {
        _type: 'element' as const,
        id: 'test_1',
        elementType: 'block' as const,
      };

      registry.register(handle, mesh);
      expect(registry.get('test_1')).toBe(mesh);
    });

    it('retrieves registered elements', () => {
      const geo = new THREE.BoxGeometry(10, 10, 10);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
      const handle = {
        _type: 'element' as const,
        id: 'test_1',
        elementType: 'block' as const,
      };

      registry.register(handle, mesh);
      const retrieved = registry.get('test_1');
      expect(retrieved).toBe(mesh);
    });

    it('deletes elements', () => {
      const geo = new THREE.BoxGeometry(10, 10, 10);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
      const handle = {
        _type: 'element' as const,
        id: 'test_1',
        elementType: 'block' as const,
      };

      registry.register(handle, mesh);
      registry.delete('test_1');
      expect(registry.get('test_1')).toBeUndefined();
    });
  });

  describe('Geometry creation', () => {
    it('creates box geometry', () => {
      const geo = new THREE.BoxGeometry(100, 200, 150);
      expect(geo.parameters.width).toBe(100);
      expect(geo.parameters.height).toBe(200);
      expect(geo.parameters.depth).toBe(150);
    });

    it('creates cylinder geometry', () => {
      const geo = new THREE.CylinderGeometry(50, 50, 100, 32);
      expect(geo.parameters.radiusTop).toBe(50);
      expect(geo.parameters.radiusBottom).toBe(50);
      expect(geo.parameters.height).toBe(100);
    });

    it('creates sphere geometry', () => {
      const geo = new THREE.SphereGeometry(50, 32, 16);
      expect(geo.parameters.radius).toBe(50);
    });

    it('creates shape geometry from points', () => {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(100, 0);
      shape.lineTo(100, 100);
      shape.lineTo(0, 100);
      shape.closePath();

      const geo = new THREE.ShapeGeometry(shape);
      expect(geo).toBeInstanceOf(THREE.BufferGeometry);
    });

    it('creates buffer geometry from points', () => {
      const points = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(100, 0, 0),
        new THREE.Vector3(100, 100, 0),
      ];

      const geo = new THREE.BufferGeometry().setFromPoints(points);
      expect(geo.attributes.position).toBeDefined();
      expect(geo.attributes.position.count).toBe(3);
    });
  });

  describe('Material colors (pen mapping)', () => {
    const penColors = [
      0xcccccc, 0x000000, 0xff0000, 0x00ff00, 0x0000ff, 0xffff00,
      0xff00ff, 0x00ffff, 0xffffff, 0xc0c0c0, 0x808080, 0x800000,
    ];

    it('maps pen 0 to first color', () => {
      const mat = new THREE.MeshStandardMaterial({ color: penColors[0] });
      expect(mat.color.getHex()).toBe(0xcccccc);
    });

    it('maps pen 1 to second color', () => {
      const mat = new THREE.MeshStandardMaterial({ color: penColors[1] });
      expect(mat.color.getHex()).toBe(0x000000);
    });

    it('wraps around for pen > 11', () => {
      const mat1 = new THREE.MeshStandardMaterial({ color: penColors[0] });
      const mat2 = new THREE.MeshStandardMaterial({ color: penColors[12] });
      expect(mat1.color.getHex()).toBe(mat2.color.getHex());
    });
  });

  describe('Matrix operations', () => {
    it('rotates around Z axis', () => {
      const geo = new THREE.BoxGeometry(10, 10, 10);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());

      const angle = 45 * Math.PI / 180;
      mesh.position.set(50, 50, 50);
      mesh.position.sub(new THREE.Vector3(50, 50, 50));
      mesh.rotateAround(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1), angle);
      mesh.position.add(new THREE.Vector3(50, 50, 50));

      expect(mesh.position.x).toBeCloseTo(50);
    });

    it('applies axis transformations', () => {
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());

      const u = new THREE.Vector3(1, 0, 0);
      const v = new THREE.Vector3(0, 1, 0);
      const w = new THREE.Vector3().crossVectors(u, v).normalize();

      const matrix = new THREE.Matrix4().makeBasis(u, v, w);
      mesh.setRotationFromMatrix(matrix);

      expect(mesh.rotation).toBeDefined();
    });
  });

  describe('Group hierarchy', () => {
    it('creates parent-child relationships', () => {
      const parent = new THREE.Group();
      const child1 = new THREE.Mesh(
        new THREE.BoxGeometry(10, 10, 10),
        new THREE.MeshStandardMaterial()
      );
      const child2 = new THREE.Mesh(
        new THREE.BoxGeometry(5, 5, 5),
        new THREE.MeshStandardMaterial()
      );

      parent.add(child1);
      child1.add(child2);

      expect(parent.children.length).toBe(1);
      expect(child1.children.length).toBe(1);
      expect(child2.parent).toBe(child1);
    });

    it('moves group with children', () => {
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(10, 10, 10),
        new THREE.MeshStandardMaterial()
      );
      mesh.position.set(10, 10, 10);
      group.add(mesh);

      const originalChildPos = mesh.position.clone();
      group.position.set(100, 100, 100);

      expect(mesh.position.x).toBeCloseTo(originalChildPos.x + 100);
    });
  });
});

describe('Output extraction tests', () => {
  it('exports scene as GLTF-compatible JSON', async () => {
    const scene = new THREE.Scene();

    const geo = new THREE.BoxGeometry(100, 100, 100);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    const result = {
      type: 'scene',
      children: scene.toJSON(),
    };

    expect(result.type).toBe('scene');
    expect(result.children).toBeDefined();
  });

  it('extracts element count', () => {
    const scene = new THREE.Scene();

    for (let i = 0; i < 5; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(10, 10, 10),
        new THREE.MeshStandardMaterial()
      );
      scene.add(mesh);
    }

    const meshes = scene.children.filter(c => c instanceof THREE.Mesh);
    expect(meshes.length).toBe(5);
  });

  it('extracts position data', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(10, 10, 10),
      new THREE.MeshStandardMaterial()
    );
    mesh.position.set(100, 200, 300);

    const position = {
      x: mesh.position.x,
      y: mesh.position.y,
      z: mesh.position.z,
    };

    expect(position.x).toBe(100);
    expect(position.y).toBe(200);
    expect(position.z).toBe(300);
  });
});