import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type {
  ServerMessage,
  RenderMessage,
  UICreateMessage,
  LogMessage,
} from '../server/protocol';

const WS_URL = 'ws://localhost:8080';

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

function initThreeJS() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);

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

  const ambientLight = new THREE.AmbientLight(0xffffff, 1);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(100, 100, 100);
  scene.add(directionalLight);

  const gridHelper = new THREE.GridHelper(500, 50);
  scene.add(gridHelper);

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
    reconnectAttempts = 0;
    appendLog('WebSocket readyState: ' + ws.readyState, 'debug');
  };

  ws.onmessage = (event) => {
    try {
      appendLog('Received: ' + event.data.toString().substring(0, 100), 'debug');
      const msg = JSON.parse(event.data) as ServerMessage;
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
  });
}

function handleRender(msg: RenderMessage) {
  const data = msg.data;
  const handle = data.handle as ElementHandle;

  switch (msg.action) {
    case 'create':
      if (msg.elementType === 'block') {
        const geo = new THREE.BoxGeometry(data.length as number, data.width as number, data.height as number);
        const mat = getMaterial((data.options as any)?.pen ?? 0);
        const mesh = new THREE.Mesh(geo, mat);

        const origin = data.origin as [number, number, number] | undefined;
        if (origin) {
          mesh.position.set(origin[0] || 0, origin[1] || 0, origin[2] || 0);
        }

        mesh.name = (data.options as any)?.name || `Block_${data.length}x${data.width}x${data.height}`;
        mesh.userData.handle = handle;

        scene.add(mesh);
        registry.set(handle.id, mesh);
      }
      else if (msg.elementType === 'cylinder') {
        const geo = new THREE.CylinderGeometry(data.radius as number, data.radius as number, data.height as number, 32);
        const mat = getMaterial((data.options as any)?.pen ?? 0);
        const mesh = new THREE.Mesh(geo, mat);

        const origin = data.origin as [number, number, number] | undefined;
        if (origin) {
          mesh.position.set(origin[0] || 0, origin[1] || 0, origin[2] || 0);
        }

        mesh.name = `Cylinder_${data.height}x${data.radius}`;
        mesh.userData.handle = handle;

        scene.add(mesh);
        registry.set(handle.id, mesh);
      }
      else if (msg.elementType === 'sphere') {
        const geo = new THREE.SphereGeometry(data.radius as number, 32, 16);
        const mat = getMaterial((data.options as any)?.pen ?? 0);
        const mesh = new THREE.Mesh(geo, mat);

        const origin = data.origin as [number, number, number] | undefined;
        if (origin) {
          mesh.position.set(origin[0] || 0, origin[1] || 0, origin[2] || 0);
        }

        mesh.name = `Sphere_${data.radius}`;
        mesh.userData.handle = handle;

        scene.add(mesh);
        registry.set(handle.id, mesh);
      }
      else if (msg.elementType === 'polygon') {
        const shape = new THREE.Shape();
        const points = data.points as [number, number][];
        if (points.length >= 2) {
          shape.moveTo(points[0][0], points[0][1]);
          for (let i = 1; i < points.length; i++) {
            shape.lineTo(points[i][0], points[i][1]);
          }
          shape.closePath();
        }
        const geo = new THREE.ShapeGeometry(shape);
        const mat = getMaterial(0);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData.handle = handle;

        scene.add(mesh);
        registry.set(handle.id, mesh);
      }
      else if (msg.elementType === 'polyline') {
        const geometry = new THREE.BufferGeometry();
        const points = data.points as [number, number][];
        const positions: number[] = [];
        for (const p of points) {
          positions.push(p[0], p[1], 0);
        }
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        const closed = data.closed as boolean;
        const line = closed
          ? new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color: 0x000000 }))
          : new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x000000 }));

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
          obj.position.x += offset[0] || 0;
          obj.position.y += offset[1] || 0;
          obj.position.z += offset[2] || 0;
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
      scene.add(new THREE.AmbientLight(0xffffff, 1));
      scene.add(new THREE.DirectionalLight(0xffffff, 1));
      scene.add(new THREE.GridHelper(500, 50));
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

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    appendLog('Not connected to server (readyState: ' + (ws ? ws.readyState : 'no ws') + ')', 'error');
    return;
  }

  appendLog('Sending Lua code...', 'info');

  const executeMsg = {
    type: 'execute',
    code: code,
    id: `exec_${Date.now()}`,
    timestamp: Date.now(),
  };
  appendLog('Sending: ' + JSON.stringify(executeMsg).substring(0, 100), 'debug');
  ws.send(JSON.stringify(executeMsg));
});

clearBtn.addEventListener('click', () => {
  send({
    type: 'render',
    action: 'clear',
    elementType: 'block',
    data: {},
  });
});

sampleBtn.addEventListener('click', () => {
  const sampleCode = `-- Pytha Lua Code
function main()
    pyui.alert("Hello from Pytha!")

    local block = pytha.create_block(100, 100, 100, {0, 0, 0})
    pytha.set_element_name(block, "My Block")
end`;

  luaEditor.value = sampleCode;
  appendLog('Sample code loaded', 'info');
});

initThreeJS();
connect();
appendLog('Pytha client initialized', 'info');