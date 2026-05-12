import * as THREE from 'three';
import type { Vector3, PythaOptions, ElementHandle, GroupHandle, PartHandle, MaterialHandle, LayerHandle } from '../types/element';

export interface ThreePlatformConfig {
  scene: THREE.Scene;
  defaultLayer: THREE.Layers;
}

let elementIdCounter = 0;

function generateId(): string {
  return `elem_${++elementIdCounter}`;
}

export class ElementRegistry {
  private elements = new Map<string, THREE.Object3D>();

  register(handle: ElementHandle, object: THREE.Object3D): void {
    this.elements.set(handle.id, object);
  }

  get(id: string): THREE.Object3D | undefined {
    return this.elements.get(id);
  }

  delete(id: string): void {
    const obj = this.elements.get(id);
    if (obj) {
      if (obj.parent) {
        obj.parent.remove(obj);
      }
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
      this.elements.delete(id);
    }
  }
}

export class ThreePlatform {
  private scene: THREE.Scene;
  private registry: ElementRegistry;
  private defaultLayer: THREE.Layers;
  private materials = new Map<string, THREE.Material>();
  private layers = new Map<string, THREE.Layers>();
  private history = new Map<string, Map<string, unknown>>();

  constructor(config: ThreePlatformConfig) {
    this.scene = config.scene;
    this.registry = new ElementRegistry();
    this.defaultLayer = config.defaultLayer;
  }

  getRegistry(): ElementRegistry {
    return this.registry;
  }

  createBlock(length: number, width: number, height: number, origin?: Vector3, options?: PythaOptions): PartHandle {
    const geo = new THREE.BoxGeometry(length, width, height);
    const mat = this.getOrCreateMaterial((options as any)?.pen ?? 0);
    const mesh = new THREE.Mesh(geo, mat);

    if (options?.u_axis && options?.v_axis) {
      const u = new THREE.Vector3(options.u_axis[0], options.u_axis[1], options.u_axis[2]);
      const v = new THREE.Vector3(options.v_axis[0], options.v_axis[1], options.v_axis[2]);
      const w = new THREE.Vector3().crossVectors(u, v).normalize();
      const matrix = new THREE.Matrix4().makeBasis(u, v, w);
      mesh.setRotationFromMatrix(matrix);
    }

    mesh.position.set(origin?.[0] ?? 0, origin?.[1] ?? 0, origin?.[2] ?? 0);
    mesh.name = options?.name ?? `Block_${length}x${width}x${height}`;
    mesh.userData.pythaHandle = true;

    this.scene.add(mesh);
    mesh.layers.set(0);

    const handle: PartHandle = {
      _type: 'element',
      _partType: true,
      id: generateId(),
      elementType: 'block',
      geometry: geo,
      material: mat,
    };

    this.registry.register(handle, mesh);
    return handle;
  }

  createCylinder(height: number, radius: number, origin?: Vector3, options?: PythaOptions): PartHandle {
    const segments = options?.segments ?? 32;
    const geo = new THREE.CylinderGeometry(radius, (options as any)?.top_radius ?? radius, height, segments);
    const mat = this.getOrCreateMaterial((options as any)?.pen ?? 0);
    const mesh = new THREE.Mesh(geo, mat);

    if (options?.u_axis && options?.v_axis) {
      const u = new THREE.Vector3(options.u_axis[0], options.u_axis[1], options.u_axis[2]);
      const v = new THREE.Vector3(options.v_axis[0], options.v_axis[1], options.v_axis[2]);
      const w = new THREE.Vector3().crossVectors(u, v).normalize();
      const matrix = new THREE.Matrix4().makeBasis(u, v, w);
      mesh.setRotationFromMatrix(matrix);
    }

    mesh.position.set(origin?.[0] ?? 0, origin?.[1] ?? 0, origin?.[2] ?? 0);
    mesh.name = options?.name ?? `Cylinder_${height}x${radius}`;
    mesh.userData.pythaHandle = true;

    this.scene.add(mesh);
    mesh.layers.set(0);

    const handle: PartHandle = {
      _type: 'element',
      _partType: true,
      id: generateId(),
      elementType: 'cylinder',
      geometry: geo,
      material: mat,
    };

    this.registry.register(handle, mesh);
    return handle;
  }

  createSphere(radius: number, origin?: Vector3, options?: PythaOptions): PartHandle {
    const geo = new THREE.SphereGeometry(radius, 32, 16);
    const mat = this.getOrCreateMaterial((options as any)?.pen ?? 0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(origin?.[0] ?? 0, origin?.[1] ?? 0, origin?.[2] ?? 0);
    mesh.name = options?.name ?? `Sphere_${radius}`;
    mesh.userData.pythaHandle = true;

    this.scene.add(mesh);
    mesh.layers.set(0);

    const handle: PartHandle = {
      _type: 'element',
      _partType: true,
      id: generateId(),
      elementType: 'sphere',
      geometry: geo,
      material: mat,
    };

    this.registry.register(handle, mesh);
    return handle;
  }

  createPolygon(points: Vector3[]): PartHandle {
    const shape = new THREE.Shape();
    if (points.length > 0) {
      shape.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) {
        shape.lineTo(points[i][0], points[i][1]);
      }
      shape.closePath();
    }

    const geo = new THREE.ShapeGeometry(shape);
    const mat = this.getOrCreateMaterial(0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.pythaHandle = true;

    this.scene.add(mesh);
    mesh.layers.set(0);

    const handle: PartHandle = {
      _type: 'element',
      _partType: true,
      id: generateId(),
      elementType: 'polygon',
      geometry: geo,
      material: mat,
    };

    this.registry.register(handle, mesh);
    return handle;
  }

  createPolyline(closed: 'closed' | 'open', points: Vector3[]): PartHandle {
    if (points.length < 2) {
      throw new Error('Polyline requires at least 2 points');
    }

    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    for (const p of points) {
      positions.push(p[0], p[1], p[2] ?? 0);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const line = closed
      ? new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color: 0x000000 }))
      : new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x000000 }));

    this.scene.add(line);
    line.layers.set(0);

    const handle: PartHandle = {
      _type: 'element',
      _partType: true,
      id: generateId(),
      elementType: 'polyline',
      geometry,
      material: line.material,
    };

    this.registry.register(handle, line);
    return handle;
  }

  createProfile(contour: unknown, height: number): PartHandle {
    console.warn('createProfile not fully implemented');
    return this.createCylinder(height, 10, [0, 0, 0]);
  }

  createGroup(elements: ElementHandle[], options?: { name?: string }): GroupHandle {
    const group = new THREE.Group();
    group.name = options?.name ?? `Group_${elements.length}_elements`;

    const children: ElementHandle[] = [];
    for (const elem of elements) {
      const obj = this.registry.get(elem.id);
      if (obj) {
        group.add(obj);
        children.push(elem);
      }
    }

    this.scene.add(group);
    group.layers.set(0);

    const handle: GroupHandle = {
      _type: 'element',
      _groupType: true,
      id: generateId(),
      elementType: 'group',
      children,
    };

    this.registry.register(handle, group);
    return handle;
  }

  deleteElement(element: ElementHandle | ElementHandle[]): void {
    const elems = Array.isArray(element) ? element : [element];
    for (const elem of elems) {
      this.registry.delete(elem.id);
    }
  }

  copyElement(element: ElementHandle, offset: Vector3): PartHandle {
    const obj = this.registry.get(element.id);
    if (!obj) {
      throw new Error(`Element ${element.id} not found`);
    }

    const cloned = obj.clone();
    cloned.position.x += offset[0];
    cloned.position.y += offset[1];
    cloned.position.z += offset[2];

    const handle: PartHandle = {
      _type: 'element',
      _partType: true,
      id: generateId(),
      elementType: element.elementType,
      geometry: (cloned as THREE.Mesh).geometry,
      material: (cloned as THREE.Mesh).material,
    };

    this.scene.add(cloned);
    cloned.layers.set(0);
    this.registry.register(handle, cloned);
    return handle;
  }

  moveElement(element: ElementHandle | ElementHandle[], offset: Vector3): void {
    const elems = Array.isArray(element) ? element : [element];
    for (const elem of elems) {
      const obj = this.registry.get(elem.id);
      if (obj) {
        obj.position.x += offset[0];
        obj.position.y += offset[1];
        obj.position.z += offset[2];
      }
    }
  }

  rotateElement(element: ElementHandle | ElementHandle[], origin: Vector3, axis: 'x' | 'y' | 'z', angle: number): void {
    const elems = Array.isArray(element) ? element : [element];
    const originVec = new THREE.Vector3(origin[0], origin[1], origin[2]);

    for (const elem of elems) {
      const obj = this.registry.get(elem.id);
      if (obj) {
        const axisVec = new THREE.Vector3(
          axis === 'x' ? 1 : 0,
          axis === 'y' ? 1 : 0,
          axis === 'z' ? 1 : 0
        );

        obj.position.sub(originVec);
        obj.rotateOnWorldAxis(axisVec, THREE.MathUtils.degToRad(angle));
        obj.position.add(originVec);
      }
    }
  }

  mirrorElement(element: ElementHandle, origin: Vector3, axis: 'x' | 'y' | 'z'): void {
    const obj = this.registry.get(element.id);
    if (obj) {
      const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
      obj.position.setComponent(axisIndex, 2 * origin[axisIndex] - obj.position.getComponent(axisIndex));
    }
  }

  setElementName(element: ElementHandle, name: string): void {
    const obj = this.registry.get(element.id);
    if (obj) {
      obj.name = name;
    }
  }

  setElementPen(element: ElementHandle, penIndex: number): void {
    const obj = this.registry.get(element.id) as THREE.Mesh | undefined;
    if (obj && obj.material instanceof THREE.Material) {
      const newMat = this.getOrCreateMaterial(penIndex);
      if (obj.material !== newMat) {
        obj.material = newMat;
      }
    }
  }

  setElementMaterial(element: ElementHandle, material: MaterialHandle): void {
    const obj = this.registry.get(element.id) as THREE.Mesh | undefined;
    if (obj && obj.material instanceof THREE.Material) {
      const mat = this.getMaterialByName(material.name);
      if (mat) {
        obj.material = mat;
      }
    }
  }

  setElementLayer(element: ElementHandle, layer: LayerHandle): void {
    console.warn('setElementLayer not fully implemented');
  }

  setElementGroup(element: ElementHandle, group: GroupHandle | null): void {
    const obj = this.registry.get(element.id);
    const groupObj = group ? this.registry.get(group.id) as THREE.Group : null;

    if (obj) {
      if (obj.parent && obj.parent !== this.scene) {
        obj.parent.remove(obj);
      }
      if (groupObj) {
        groupObj.add(obj);
      } else {
        this.scene.add(obj);
      }
    }
  }

  getElementHistory<T>(element: ElementHandle, key: string): T | undefined {
    const elemHistory = this.history.get(element.id);
    if (elemHistory) {
      return elemHistory.get(key) as T | undefined;
    }
    return undefined;
  }

  setElementHistory<T>(element: ElementHandle, data: T, key: string): void {
    if (!this.history.has(element.id)) {
      this.history.set(element.id, new Map());
    }
    this.history.get(element.id)!.set(key, data);
  }

  getGroupDescendants(group: GroupHandle): ElementHandle[] {
    return group.children;
  }

  booleanUnion(elements: ElementHandle[]): PartHandle {
    if (elements.length < 2) {
      return elements[0] as PartHandle;
    }
    return elements[0] as PartHandle;
  }

  booleanDifference(element: ElementHandle, tools: ElementHandle[]): PartHandle {
    return element as PartHandle;
  }

  booleanIntersection(elements: ElementHandle[]): PartHandle {
    return elements[0] as PartHandle;
  }

  getMaterial(name: string): MaterialHandle {
    return { _type: 'material', id: `mat_${name}`, name };
  }

  createLayer(name: string): LayerHandle {
    return { _type: 'layer', id: `layer_${name}`, name };
  }

  getDefaultLayer(): LayerHandle {
    return { _type: 'layer', id: 'layer_default', name: 'default' };
  }

  private getOrCreateMaterial(penIndex: number): THREE.Material {
    const key = `pen_${penIndex}`;
    if (this.materials.has(key)) {
      return this.materials.get(key)!;
    }

    const colors = [
      0xcccccc, 0x000000, 0xff0000, 0x00ff00, 0x0000ff, 0xffff00,
      0xff00ff, 0x00ffff, 0xffffff, 0xc0c0c0, 0x808080, 0x800000,
    ];

    const mat = new THREE.MeshStandardMaterial({
      color: colors[penIndex % colors.length],
      roughness: 0.5,
      metalness: 0.1,
    });

    this.materials.set(key, mat);
    return mat;
  }

  private getMaterialByName(name: string): THREE.Material | undefined {
    for (const mat of this.materials.values()) {
      if (mat instanceof THREE.MeshStandardMaterial && mat.name === name) {
        return mat;
      }
    }
    return undefined;
  }
}