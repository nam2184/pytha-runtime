import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type {
  ServerMessage,
  RenderMessage,
  UICreateMessage,
  LogMessage,
} from '../server/protocol';

const WS_URL = `ws://localhost:${import.meta.env.VITE_WS_PORT ?? '8081'}`;

interface ElementHandle {
  _type: 'element';
  id: string;
  elementType: string;
  data?: Record<string, unknown>;
}

const container = document.getElementById('three-container') as HTMLElement;
const luaEditor = document.getElementById('lua-editor') as HTMLTextAreaElement;
const logPanel = document.getElementById('log-panel') as HTMLElement;
const runBtn = document.getElementById('run-btn') as HTMLButtonElement;
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
const sampleBtn = document.getElementById('sample-btn') as HTMLButtonElement;

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
const registry = new Map<string, THREE.Object3D>();

let ws: WebSocket;
let reconnectAttempts = 0;
const MAX_RECONNECT = 5;
const UNIT_SCALE = 0.1;

function scaleValue(value: unknown) {
  return typeof value === 'number' ? value * UNIT_SCALE : 0;
}

function scaleVector3(vector: [number, number, number] | undefined): [number, number, number] {
  return [
    (vector?.[0] ?? 0) * UNIT_SCALE,
    (vector?.[1] ?? 0) * UNIT_SCALE,
    (vector?.[2] ?? 0) * UNIT_SCALE,
  ];
}

function scalePoint(point: number[]) {
  return [
    (point[0] ?? 0) * UNIT_SCALE,
    (point[1] ?? 0) * UNIT_SCALE,
    (point[2] ?? 0) * UNIT_SCALE,
  ] as [number, number, number];
}

function createAxisHelpers() {
  const group = new THREE.Group();
  group.renderOrder = 998;

  const arrowX = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 50, 0xff0000, 3, 2);
  const arrowY = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 50, 0x00ff00, 3, 2);
  const arrowZ = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 50, 0x0000ff, 3, 2);
  group.add(arrowX, arrowY, arrowZ);

  return group;
}

function createGridHelper() {
  const group = new THREE.Group();
  group.renderOrder = 999;

  const xzGrid = new THREE.GridHelper(500, 50, 0xffffff, 0xcccccc);
  const xzMaterial = (xzGrid as THREE.Mesh).material as THREE.Material;
  xzMaterial.depthTest = false;
  xzMaterial.depthWrite = false;
  xzMaterial.transparent = true;
  xzMaterial.opacity = 0.5;
  group.add(xzGrid);

  return group;
}

function addSceneHelpers() {
  scene.add(new THREE.AmbientLight(0xffffff, 1));

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(100, 100, 100);
  scene.add(directionalLight);

  scene.add(createGridHelper());
  scene.add(createAxisHelpers());
}

function clearScene() {
  while (scene.children.length > 0) {
    scene.remove(scene.children[0]);
  }
  addSceneHelpers();
  registry.clear();
}

function initThreeJS() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 5000);
  camera.position.set(300, 200, 300);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = true;
  controls.minDistance = 10;
  controls.maxDistance = 2000;
  controls.maxPolarAngle = Math.PI;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.ROTATE,
  };
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN,
  };

  addSceneHelpers();

  window.addEventListener('resize', onWindowResize);

  animate();
}

function onWindowResize() {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

function appendLog(message: string, type: 'info' | 'error' | 'debug' | 'normal' = 'normal') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logPanel.appendChild(entry);
  logPanel.scrollTop = logPanel.scrollHeight;
}

function connect() {
  appendLog('Connecting to Pytha server...', 'info');

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    appendLog('Connected to Pytha server', 'info');
    console.log('[Client] WebSocket connected, readyState:', ws.readyState);
    reconnectAttempts = 0;
  };

  ws.onmessage = (event) => {
    try {
      const raw = event.data.toString();
      appendLog('Received: ' + raw.substring(0, 100), 'debug');
      const msg = JSON.parse(raw) as ServerMessage;
      handleMessage(msg);
    } catch (err) {
      appendLog(`Failed to parse message: ${err}`, 'error');
    }
  };

  ws.onclose = () => {
    appendLog('Disconnected from server', 'error');
    if (reconnectAttempts < MAX_RECONNECT) {
      reconnectAttempts++;
      appendLog(`Reconnecting... (${reconnectAttempts}/${MAX_RECONNECT})`, 'info');
      setTimeout(connect, 2000);
    } else {
      appendLog('Max reconnect attempts reached. Please refresh.', 'error');
    }
  };

  ws.onerror = () => {
    appendLog('WebSocket error', 'error');
  };
}

function send(msg: object) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function handleMessage(msg: ServerMessage) {
  switch (msg.type) {
    case 'log':
      const logMsg = msg as LogMessage;
      console.log(`[${logMsg.level}] ${logMsg.message}`);
      appendLog(logMsg.message, logMsg.level === 'error' ? 'error' : 'debug');
      break;

    case 'render':
      handleRender(msg as RenderMessage);
      break;

    case 'ui_create':
      handleUICreate(msg as UICreateMessage);
      break;

    case 'result':
      if ((msg as any).success) {
        console.log('[Result] Execution completed successfully');
        appendLog('Execution completed', 'info');
      }
      break;

    case 'error':
      console.error('[Error]', (msg as any).message);
      appendLog((msg as any).message, 'error');
      break;
  }
}

const colors = [
  0xcccccc, 0x000000, 0xff0000, 0x00ff00, 0x0000ff, 0xffff00,
  0xff00ff, 0x00ffff, 0xffffff, 0xc0c0c0, 0x808080, 0x800000,
];

function getMaterial(penIndex: number): THREE.Material {
  return new THREE.MeshStandardMaterial({
    color: colors[penIndex % colors.length],
    roughness: 0.5,
    metalness: 0.1,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
}

function handleRender(msg: RenderMessage) {
  const data = msg.data;
  const handle = data.handle as ElementHandle;

  switch (msg.action) {
    case 'create':
      if (msg.elementType === 'block') {
        const w = scaleValue(data.length);
        const h = scaleValue(data.height);
        const d = scaleValue(data.width);
        const geo = new THREE.BoxGeometry(w, h, d);
        const mat = getMaterial((data.options as any)?.pen ?? 0);
        const mesh = new THREE.Mesh(geo, mat);

        const origin = data.origin as [number, number, number] | undefined;
        if (origin) {
          const scaled = scaleVector3(origin);
          mesh.position.set(scaled[0] + w / 2, scaled[1] + h / 2, scaled[2] + d / 2);
        }

        mesh.name = (data.options as any)?.name || `Block_${data.length}x${data.width}x${data.height}`;
        mesh.userData.handle = handle;

        scene.add(mesh);
        registry.set(handle.id, mesh);
      }
      else if (msg.elementType === 'cylinder') {
        const radius = scaleValue(data.radius);
        const h = scaleValue(data.height);
        const geo = new THREE.CylinderGeometry(radius, radius, h, 32);
        const mat = getMaterial((data.options as any)?.pen ?? 0);
        const mesh = new THREE.Mesh(geo, mat);

        const origin = data.origin as [number, number, number] | undefined;
        if (origin) {
          const scaled = scaleVector3(origin);
          mesh.position.set(scaled[0] + radius, scaled[1] + h / 2, scaled[2] + radius);
        }

        mesh.name = `Cylinder_${data.height}x${data.radius}`;
        mesh.userData.handle = handle;

        scene.add(mesh);
        registry.set(handle.id, mesh);
      }
      else if (msg.elementType === 'sphere') {
        const geo = new THREE.SphereGeometry(scaleValue(data.radius), 32, 16);
        const mat = getMaterial((data.options as any)?.pen ?? 0);
        const mesh = new THREE.Mesh(geo, mat);

        const origin = data.origin as [number, number, number] | undefined;
        if (origin) {
          mesh.position.set(...scaleVector3(origin));
        }

        mesh.name = `Sphere_${data.radius}`;
        mesh.userData.handle = handle;

        scene.add(mesh);
        registry.set(handle.id, mesh);
      }
      else if (msg.elementType === 'polygon') {
        const shape = new THREE.Shape();
        const points = data.points as number[][];
        const scaledPoints = points.map(p => scalePoint(p));
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
        const mat = getMaterial(0);
        const mesh = new THREE.Mesh(geo, mat);

        let cx = 0, cy = 0;
        for (const p of scaledPoints) { cx += p[0]; cy += p[1]; }
        cx /= scaledPoints.length;
        cy /= scaledPoints.length;

        const origin = data.origin as [number, number, number] | undefined;
        if (origin) {
          const scaled = scaleVector3(origin);
          mesh.position.set(scaled[0] + cx, scaled[1] + cy, scaled[2]);
        }
        mesh.userData.handle = handle;

        scene.add(mesh);
        registry.set(handle.id, mesh);
      }
      else if (msg.elementType === 'polyline') {
        const geometry = new THREE.BufferGeometry();
        const points = data.points as number[][];
        const positions: number[] = [];
        for (const p of points) {
          positions.push(...scalePoint(p));
        }
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        const closed = data.closed as boolean;
        const line = closed
          ? new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color: 0x000000 }))
          : new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x000000 }));
        const origin = data.origin as [number, number, number] | undefined;
        if (origin) {
          line.position.set(...scaleVector3(origin));
        }

        scene.add(line);
        registry.set(handle.id, line);
      }
      else if (msg.elementType === 'group') {
        const group = new THREE.Group();
        const elements = data.elements as ElementHandle[];
        for (const elem of elements) {
          const obj = registry.get(elem.id);
          if (obj) group.add(obj);
        }
        group.name = (data.options as any)?.name || `Group_${elements.length}_elements`;
        group.userData.handle = handle;

        scene.add(group);
        registry.set(handle.id, group);
      }
      break;

    case 'update':
      const obj = registry.get(handle.id);
      if (obj) {
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
          obj.material = getMaterial(data.penIndex as number);
        }
      }
      break;

    case 'delete':
      const toDelete = registry.get(handle.id);
      if (toDelete) {
        if (toDelete.parent) {
          toDelete.parent.remove(toDelete);
        }
        if (toDelete instanceof THREE.Mesh) {
          toDelete.geometry.dispose();
        }
        registry.delete(handle.id);
      }
      break;

    case 'clear':
      while (scene.children.length > 0) {
        scene.remove(scene.children[0]);
      }
      addSceneHelpers();
      registry.clear();
      break;
  }
}

const pendingCallbacks = new Map<string, (value: unknown) => void>();

function handleUICreate(msg: UICreateMessage) {
  const dialogEl = document.createElement('div');
  dialogEl.className = 'pytha-dialog';
  dialogEl.dataset.dialogId = msg.dialogId;

  const titleBar = document.createElement('div');
  titleBar.className = 'pytha-dialog-title';
  titleBar.textContent = 'Dialog';
  dialogEl.appendChild(titleBar);

  const content = document.createElement('div');
  content.className = 'pytha-dialog-content';
  dialogEl.appendChild(content);

  const footer = document.createElement('div');
  footer.className = 'pytha-dialog-footer';
  dialogEl.appendChild(footer);

  for (const ctrl of msg.controls) {
    const ctrlDiv = document.createElement('div');
    ctrlDiv.className = `pytha-control pytha-control-${ctrl.type}`;
    ctrlDiv.dataset.controlId = ctrl.id;
    ctrlDiv.dataset.dialogId = msg.dialogId;
    content.appendChild(ctrlDiv);

    if (ctrl.type === 'label') {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'pytha-input pytha-label';
      input.value = ctrl.label || '';
      input.disabled = true;
      ctrlDiv.appendChild(input);
    }
    else if (ctrl.type === 'text_box') {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'pytha-input';
      input.value = ctrl.value || '';
      ctrlDiv.appendChild(input);

      input.addEventListener('input', () => {
        send({
          type: 'ui_event',
          dialogId: msg.dialogId,
          controlId: ctrl.id,
          eventType: 'change',
          value: input.value,
        });
      });
    }
    else if (ctrl.type === 'button') {
      const btn = document.createElement('button');
      btn.className = 'pytha-dialog-button';
      btn.textContent = ctrl.label || 'Button';
      ctrlDiv.appendChild(btn);

      btn.addEventListener('click', () => {
        send({
          type: 'ui_event',
          dialogId: msg.dialogId,
          controlId: ctrl.id,
          eventType: 'click',
          value: undefined,
        });
      });
    }
    else if (ctrl.type === 'check_box') {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'pytha-input';
      input.checked = ctrl.checked || false;
      ctrlDiv.appendChild(input);

      const label = document.createElement('span');
      label.textContent = ctrl.label || '';
      ctrlDiv.appendChild(label);

      input.addEventListener('change', () => {
        send({
          type: 'ui_event',
          dialogId: msg.dialogId,
          controlId: ctrl.id,
          eventType: 'change',
          value: input.checked,
        });
      });
    }
    else if (ctrl.type === 'combo_box' || ctrl.type === 'list_box') {
      const select = document.createElement('select');
      select.className = 'pytha-input';
      const items = ctrl.items || [];
      for (const item of items) {
        const option = document.createElement('option');
        option.textContent = item;
        select.appendChild(option);
      }
      ctrlDiv.appendChild(select);

      select.addEventListener('change', () => {
        send({
          type: 'ui_event',
          dialogId: msg.dialogId,
          controlId: ctrl.id,
          eventType: 'change',
          value: select.value,
        });
      });
    }
  }

  const okBtn = document.createElement('button');
  okBtn.className = 'pytha-dialog-button pytha-dialog-ok';
  okBtn.textContent = 'OK';
  footer.appendChild(okBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'pytha-dialog-button pytha-dialog-cancel';
  cancelBtn.textContent = 'Cancel';
  footer.appendChild(cancelBtn);

  okBtn.addEventListener('click', () => {
    if (dialogEl.parentNode) {
      dialogEl.parentNode.removeChild(dialogEl);
    }
    send({
      type: 'ui_event',
      dialogId: msg.dialogId,
      controlId: 'ok',
      eventType: 'click',
      value: undefined,
    });
  });

  cancelBtn.addEventListener('click', () => {
    if (dialogEl.parentNode) {
      dialogEl.parentNode.removeChild(dialogEl);
    }
    send({
      type: 'ui_event',
      dialogId: msg.dialogId,
      controlId: 'cancel',
      eventType: 'click',
      value: undefined,
    });
  });

  document.body.appendChild(dialogEl);
}

runBtn.addEventListener('click', () => {
  const code = luaEditor.value;
  if (!code.trim()) {
    appendLog('No code to execute', 'error');
    return;
  }

  console.log('[Client] ws readyState:', ws ? ws.readyState : 'ws is null');

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    appendLog('Not connected to server (readyState: ' + (ws ? ws.readyState : 'no ws') + ')', 'error');
    console.log('[Client] Cannot send - WebSocket not open, state:', ws?.readyState);
    return;
  }

  clearScene();

  const executeMsg = {
    type: 'execute',
    code: code,
    id: `exec_${Date.now()}`,
    timestamp: Date.now(),
  };
  console.log('[Client] Sending execute message:', JSON.stringify(executeMsg).substring(0, 80));
  ws.send(JSON.stringify(executeMsg));
  console.log('[Client] Message sent');
});

clearBtn.addEventListener('click', () => {
  clearScene();
});

sampleBtn.addEventListener('click', () => {
  const sampleCode = `-- Cabinet sample
function main()
    local width = 600
    local depth = 400
    local height = 800
    local panel = 18
    local back = 8

    local left = pytha.create_block(panel, depth, height, {0, 0, 0})
    pytha.set_element_name(left, "Left side")
    pytha.set_element_pen(left, 3)

    local right = pytha.create_block(panel, depth, height, {width - panel, 0, 0})
    pytha.set_element_name(right, "Right side")
    pytha.set_element_pen(right, 3)

    local bottom = pytha.create_block(width, depth, panel, {0, 0, 0})
    pytha.set_element_name(bottom, "Bottom")
    pytha.set_element_pen(bottom, 4)

    local top = pytha.create_block(width, depth, panel, {0, 0, height - panel})
    pytha.set_element_name(top, "Top")
    pytha.set_element_pen(top, 4)

    local back_panel = pytha.create_block(width, back, height, {0, depth - back, 0})
    pytha.set_element_name(back_panel, "Back panel")
    pytha.set_element_pen(back_panel, 8)

    local shelf1 = pytha.create_block(width - panel * 2, depth - back, panel, {panel, 0, height * 0.35 - panel / 2})
    pytha.set_element_name(shelf1, "Lower shelf")
    pytha.set_element_pen(shelf1, 5)

    local shelf2 = pytha.create_block(width - panel * 2, depth - back, panel, {panel, 0, height * 0.65 - panel / 2})
    pytha.set_element_name(shelf2, "Upper shelf")
    pytha.set_element_pen(shelf2, 5)

    local left_door = pytha.create_block((width / 2) - 4, panel, height - panel * 2, {0, -panel, panel})
    pytha.set_element_name(left_door, "Left door")
    pytha.set_element_pen(left_door, 6)

    local right_door = pytha.create_block((width / 2) - 4, panel, height - panel * 2, {(width / 2) + 4, -panel, panel})
    pytha.set_element_name(right_door, "Right door")
    pytha.set_element_pen(right_door, 6)

    local handle_left = pytha.create_block(12, 12, 120, {(width / 2) - 40, -panel - 12, height / 2})
    pytha.set_element_name(handle_left, "Left handle")
    pytha.set_element_pen(handle_left, 2)

    local handle_right = pytha.create_block(12, 12, 120, {(width / 2) + 28, -panel - 12, height / 2})
    pytha.set_element_name(handle_right, "Right handle")
    pytha.set_element_pen(handle_right, 2)

    pytha.create_group({left, right, bottom, top, back_panel, shelf1, shelf2, left_door, right_door, handle_left, handle_right}, {name = "Sample cabinet"})
    pyui.alert("Created sample cabinet - bottom-left-front at origin")
end`;

  luaEditor.value = sampleCode;
  appendLog('Sample code loaded', 'info');
});

initThreeJS();
connect();
appendLog('Pytha client initialized', 'info');
