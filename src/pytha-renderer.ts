import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { RenderMessage } from '@/shared/protocol';
import type { DiscriminatedMap, ElementHandle, HandlerMap } from '@/src/client-types';
import { applyMaterialMode, getMaterial } from '@/src/materials';
import { addSceneHelpers, POSITIVE_AXIS_LENGTH } from '@/src/scene-helpers';
import { scalePoint, scalePythaXYPoint, scaleValue, scaleVector3 } from '@/src/units';

type RenderActionMap = {
  create: Pick<RenderMessage, 'elementType' | 'data'>;
  update: Pick<RenderMessage, 'data'>;
  delete: Pick<RenderMessage, 'data'>;
  clear: Pick<RenderMessage, 'data'>;
};

type ElementCreateMap = {
  block: { data: Record<string, unknown>; handle: ElementHandle };
  cylinder: { data: Record<string, unknown>; handle: ElementHandle };
  sphere: { data: Record<string, unknown>; handle: ElementHandle };
  polygon: { data: Record<string, unknown>; handle: ElementHandle };
  polyline: { data: Record<string, unknown>; handle: ElementHandle };
  group: { data: Record<string, unknown>; handle: ElementHandle };
};

type ElementCreateMessage = DiscriminatedMap<'elementType', ElementCreateMap>;

type ScreenPoint = { x: number; y: number };

type AxisLabel = {
  text: string;
  color: string;
  direction: THREE.Vector3;
  element: HTMLDivElement;
};

export class PythaRenderer {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private registry = new Map<string, THREE.Object3D>();
  private axisLabels: AxisLabel[] = [];
  private transparentMode = false;

  private readonly renderActionHandlers = {
    create: (msg) => {
      const handle = msg.data.handle as ElementHandle;
      this.createElement(msg.elementType, msg.data, handle);
    },
    update: (msg) => {
      const handle = msg.data.handle as ElementHandle;
      this.updateElement(msg.data, handle);
    },
    delete: (msg) => {
      const handle = msg.data.handle as ElementHandle;
      this.deleteElement(handle);
    },
    clear: () => {
      this.clearScene();
    },
  } satisfies HandlerMap<'action', RenderActionMap>;

  private readonly createElementHandlers = {
    block: ({ data, handle }) => this.createBlock(data, handle),
    cylinder: ({ data, handle }) => this.createCylinder(data, handle),
    sphere: ({ data, handle }) => this.createSphere(data, handle),
    polygon: ({ data, handle }) => this.createPolygon(data, handle),
    polyline: ({ data, handle }) => this.createPolyline(data, handle),
    group: ({ data, handle }) => this.createGroup(data, handle),
  } satisfies HandlerMap<'elementType', ElementCreateMap>;

  constructor(private readonly container: HTMLElement) {
  }

  init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    this.camera = new THREE.PerspectiveCamera(50, this.container.clientWidth / this.container.clientHeight, 0.1, 5000);
    this.camera.position.set(200, 300, 300);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    if (getComputedStyle(this.container).position === 'static') {
      this.container.style.position = 'relative';
    }
    this.container.appendChild(this.renderer.domElement);
    this.createAxisLabels();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 2000;
    this.controls.maxPolarAngle = Math.PI;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };

    addSceneHelpers(this.scene);
    window.addEventListener('resize', () => this.onWindowResize());
    this.animate();
  }

  clearScene() {
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }
    addSceneHelpers(this.scene);
    this.registry.clear();
  }

  setTransparentMode(enabled: boolean) {
    this.transparentMode = enabled;
    for (const object of this.registry.values()) {
      object.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          applyMaterialMode(material, this.transparentMode);
        }
      });
    }
  }

  handleRender(msg: RenderMessage) {
    const handler = this.renderActionHandlers[msg.action] as (message: RenderMessage) => void;
    handler(msg);
  }

  private onWindowResize() {
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }

  private animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.updateAxisLabels();
    this.renderer.render(this.scene, this.camera);
  }

  private createAxisLabels() {
    this.axisLabels = [
      this.createAxisLabel('Y', '#ff0000', new THREE.Vector3(POSITIVE_AXIS_LENGTH, 0, 0)),
      this.createAxisLabel('X', '#00ff00', new THREE.Vector3(0, 0, POSITIVE_AXIS_LENGTH)),
      this.createAxisLabel('Z', '#0000ff', new THREE.Vector3(0, POSITIVE_AXIS_LENGTH, 0)),
    ];
  }

  private createAxisLabel(text: string, color: string, direction: THREE.Vector3): AxisLabel {
    const element = document.createElement('div');
    element.textContent = text;
    element.style.position = 'absolute';
    element.style.transform = 'translate(-50%, -50%)';
    element.style.color = color;
    element.style.font = '700 18px Arial, sans-serif';
    element.style.lineHeight = '1';
    element.style.textShadow = '0 0 4px #000, 0 0 8px #000';
    element.style.pointerEvents = 'none';
    element.style.zIndex = '5';
    this.container.appendChild(element);

    return { text, color, direction, element };
  }

  private updateAxisLabels() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width <= 0 || height <= 0) return;

    for (const label of this.axisLabels) {
      const screenRay = this.getPositiveAxisScreenRay(label.direction, width, height);
      const intersection = screenRay
        ? this.getViewportEdgeIntersection(screenRay.start, screenRay.direction, width, height, 18)
        : null;

      if (!intersection) {
        label.element.style.display = 'none';
        continue;
      }

      label.element.style.display = 'block';
      label.element.style.left = `${intersection.x}px`;
      label.element.style.top = `${intersection.y}px`;
    }
  }

  private getPositiveAxisScreenRay(axisEnd: THREE.Vector3, width: number, height: number): { start: ScreenPoint; direction: ScreenPoint } | null {
    const samples = 64;
    const projectedPoints: ScreenPoint[] = [];

    for (let i = 0; i <= samples; i++) {
      const point = axisEnd.clone().multiplyScalar(i / samples);
      if (!this.isPointInFrontOfCamera(point)) continue;

      const projected = this.projectToScreen(point, width, height);
      if (Number.isFinite(projected.x) && Number.isFinite(projected.y)) {
        projectedPoints.push(projected);
      }
    }

    if (projectedPoints.length < 2) {
      return null;
    }

    const start = projectedPoints[0];
    const end = projectedPoints[projectedPoints.length - 1];
    return {
      start,
      direction: { x: end.x - start.x, y: end.y - start.y },
    };
  }

  private isPointInFrontOfCamera(point: THREE.Vector3) {
    const cameraSpacePoint = point.clone().applyMatrix4(this.camera.matrixWorldInverse);
    return cameraSpacePoint.z < -this.camera.near;
  }

  private projectToScreen(point: THREE.Vector3, width: number, height: number): ScreenPoint {
    const projected = point.clone().project(this.camera);
    return {
      x: (projected.x * 0.5 + 0.5) * width,
      y: (-projected.y * 0.5 + 0.5) * height,
    };
  }

  private getViewportEdgeIntersection(start: ScreenPoint, direction: ScreenPoint, width: number, height: number, padding: number): ScreenPoint | null {
    if (Math.abs(direction.x) < 0.0001 && Math.abs(direction.y) < 0.0001) {
      return null;
    }

    const left = padding;
    const right = width - padding;
    const top = padding;
    const bottom = height - padding;
    const candidates: Array<ScreenPoint & { t: number }> = [];

    if (Math.abs(direction.x) >= 0.0001) {
      const xEdge = direction.x > 0 ? right : left;
      const t = (xEdge - start.x) / direction.x;
      const y = start.y + direction.y * t;
      if (t >= 0 && y >= top && y <= bottom) {
        candidates.push({ x: xEdge, y, t });
      }
    }

    if (Math.abs(direction.y) >= 0.0001) {
      const yEdge = direction.y > 0 ? bottom : top;
      const t = (yEdge - start.y) / direction.y;
      const x = start.x + direction.x * t;
      if (t >= 0 && x >= left && x <= right) {
        candidates.push({ x, y: yEdge, t });
      }
    }

    candidates.sort((a, b) => a.t - b.t);
    const hit = candidates[0];
    return hit ? { x: hit.x, y: hit.y } : null;
  }

  private createElement(elementType: RenderMessage['elementType'], data: Record<string, unknown>, handle: ElementHandle) {
    const handler = this.createElementHandlers[elementType] as (message: ElementCreateMessage) => void;
    handler({ elementType, data, handle } as ElementCreateMessage);
  }

  private createBlock(data: Record<string, unknown>, handle: ElementHandle) {
    const w = scaleValue(data.length);
    const h = scaleValue(data.height);
    const d = scaleValue(data.width);
    const geo = new THREE.BoxGeometry(d, h, w);
    const mat = getMaterial((data.options as any)?.pen ?? 0, this.transparentMode);
    const mesh = new THREE.Mesh(geo, mat);

    const origin = data.origin as [number, number, number] | undefined;
    if (origin) {
      const scaled = scaleVector3(origin);
      mesh.position.set(scaled[1] + d / 2, scaled[2] + h / 2, scaled[0] + w / 2);
    }

    mesh.name = (data.options as any)?.name || `Block_${data.length}x${data.width}x${data.height}`;
    this.addObject(handle, mesh);
  }

  private createCylinder(data: Record<string, unknown>, handle: ElementHandle) {
    const h = scaleValue(data.height);
    const r = scaleValue(data.radius);
    const geo = new THREE.CylinderGeometry(r, r, h, 32);
    const mat = getMaterial((data.options as any)?.pen ?? 0, this.transparentMode);
    const mesh = new THREE.Mesh(geo, mat);

    const origin = data.origin as [number, number, number] | undefined;
    if (origin) {
      const scaled = scaleVector3(origin);
      mesh.position.set(scaled[1] + r, scaled[2] + h / 2, scaled[0] + r);
    }

    mesh.name = `Cylinder_${data.height}x${data.radius}`;
    this.addObject(handle, mesh);
  }

  private createSphere(data: Record<string, unknown>, handle: ElementHandle) {
    const r = scaleValue(data.radius);
    const geo = new THREE.SphereGeometry(r, 32, 16);
    const mat = getMaterial((data.options as any)?.pen ?? 0, this.transparentMode);
    const mesh = new THREE.Mesh(geo, mat);

    const origin = data.origin as [number, number, number] | undefined;
    if (origin) {
      const scaled = scaleVector3(origin);
      mesh.position.set(scaled[1] + r, scaled[2] + r, scaled[0] + r);
    }

    mesh.name = `Sphere_${data.radius}`;
    this.addObject(handle, mesh);
  }

  private createPolygon(data: Record<string, unknown>, handle: ElementHandle) {
    const shape = new THREE.Shape();
    const points = data.points as number[][];
    const scaledPoints = points.map(p => scalePythaXYPoint(p));
    if (scaledPoints.length >= 2) {
      const first = scaledPoints[0];
      shape.moveTo(first[0], first[1]);
      for (let i = 1; i < scaledPoints.length; i++) {
        const point = scaledPoints[i];
        shape.lineTo(point[0], point[1]);
      }
      shape.closePath();
    }
    const geo = new THREE.ShapeGeometry(shape);
    const mat = getMaterial(0, this.transparentMode);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;

    const origin = data.origin as [number, number, number] | undefined;
    if (origin) {
      const scaled = scaleVector3(origin);
      mesh.position.set(scaled[1], scaled[2], scaled[0]);
    }

    this.addObject(handle, mesh);
  }

  private createPolyline(data: Record<string, unknown>, handle: ElementHandle) {
    const geometry = new THREE.BufferGeometry();
    const points = data.points as number[][];
    const origin = data.origin as [number, number, number] | undefined;
    const positions: number[] = [];

    if (origin) {
      const scaled = scaleVector3(origin);
      positions.push(scaled[1], scaled[2], scaled[0]);
    }

    for (const p of points) {
      positions.push(...scalePoint(p));
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const closed = data.closed as boolean;
    const line = closed
      ? new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color: 0x000000 }))
      : new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x000000 }));

    this.scene.add(line);
    this.registry.set(handle.id, line);
  }

  private createGroup(data: Record<string, unknown>, handle: ElementHandle) {
    const group = new THREE.Group();
    const elements = data.elements as ElementHandle[];
    for (const elem of elements) {
      const obj = this.registry.get(elem.id);
      if (obj) group.add(obj);
    }
    group.name = (data.options as any)?.name || `Group_${elements.length}_elements`;
    this.addObject(handle, group);
  }

  private updateElement(data: Record<string, unknown>, handle: ElementHandle) {
    const obj = this.registry.get(handle.id);
    if (!obj) return;

    if (data.offset) {
      const offset = data.offset as [number, number, number];
      const scaledOffset = scaleVector3(offset);
      obj.position.x += scaledOffset[0];
      obj.position.y += scaledOffset[1];
      obj.position.z += scaledOffset[2];
    }
    if (data.name) {
      obj.name = data.name as string;
    }
    if (typeof data.penIndex === 'number' && obj instanceof THREE.Mesh) {
      obj.material = getMaterial(data.penIndex as number, this.transparentMode);
    }
  }

  private deleteElement(handle: ElementHandle) {
    const toDelete = this.registry.get(handle.id);
    if (!toDelete) return;

    if (toDelete.parent) {
      toDelete.parent.remove(toDelete);
    }
    if (toDelete instanceof THREE.Mesh) {
      toDelete.geometry.dispose();
    }
    this.registry.delete(handle.id);
  }

  private addObject(handle: ElementHandle, object: THREE.Object3D) {
    object.userData.handle = handle;
    this.scene.add(object);
    this.registry.set(handle.id, object);
  }
}
