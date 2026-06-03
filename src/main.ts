import type {
  ErrorMessage,
  LogMessage,
  RenderMessage,
  ResultMessage,
  ServerMessage,
  UICreateMessage,
} from '../server/protocol';
import type { HandlerMap } from './client-types';
import { createLogAppender } from './log-panel';
import { PythaRenderer } from './pytha-renderer';
import { handleUICreate } from './pyui-client';
import { SAMPLES, type SampleKey } from './sample-code';
import { createPythaSocket } from './ws-client';

const WS_URL = `ws://localhost:${import.meta.env.VITE_WS_PORT ?? 8080}`;

const container = document.getElementById('three-container') as HTMLElement;
const luaEditor = document.getElementById('lua-editor') as HTMLTextAreaElement;
const logPanel = document.getElementById('log-panel') as HTMLElement;
const runBtn = document.getElementById('run-btn') as HTMLButtonElement;
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
const sampleSelect = document.getElementById('sample-select') as HTMLSelectElement;

const appendLog = createLogAppender(logPanel);
const renderer = new PythaRenderer(container);

const socket = createPythaSocket({
  url: WS_URL,
  appendLog,
  onMessage: handleMessage,
});

type ServerMessageHandlerMap = {
  log: Pick<LogMessage, 'level' | 'message'>;
  render: Pick<RenderMessage, 'action' | 'elementType' | 'data'>;
  ui_create: Pick<UICreateMessage, 'dialogId' | 'controls'>;
  result: Pick<ResultMessage, 'success' | 'data'>;
  error: Pick<ErrorMessage, 'message'>;
};

const serverMessageHandlers = {
  log: (msg) => {
    console.log(`[${msg.level}] ${msg.message}`);
    appendLog(msg.message, msg.level === 'error' ? 'error' : 'debug');
  },
  render: (msg) => {
    renderer.handleRender(msg as RenderMessage);
  },
  ui_create: (msg) => {
    handleUICreate(msg as UICreateMessage, socket.send);
  },
  result: (msg) => {
    if (msg.success) {
      console.log('[Result] Execution completed successfully');
      appendLog('Execution completed', 'info');
    }
  },
  error: (msg) => {
    console.error('[Error]', msg.message);
    appendLog(msg.message, 'error');
  },
} satisfies HandlerMap<'type', ServerMessageHandlerMap>;

function handleMessage(msg: ServerMessage) {
  if (!isHandledServerMessage(msg.type)) return;

  const handler = serverMessageHandlers[msg.type] as (message: ServerMessage) => void;
  handler(msg);
}

function isHandledServerMessage(type: ServerMessage['type']): type is keyof ServerMessageHandlerMap {
  return type in serverMessageHandlers;
}

runBtn.addEventListener('click', () => {
  const code = luaEditor.value;
  if (!code.trim()) {
    appendLog('No code to execute', 'error');
    return;
  }

  console.log('[Client] ws readyState:', socket.readyState() ?? 'ws is null');

  if (!socket.isOpen()) {
    appendLog('Not connected to server (readyState: ' + (socket.readyState() ?? 'no ws') + ')', 'error');
    console.log('[Client] Cannot send - WebSocket not open, state:', socket.readyState());
    return;
  }

  renderer.clearScene();

  const executeMsg = {
    type: 'execute',
    code,
    id: `exec_${Date.now()}`,
    timestamp: Date.now(),
  };
  console.log('[Client] Sending execute message:', JSON.stringify(executeMsg).substring(0, 80));
  if (socket.send(executeMsg)) {
    console.log('[Client] Message sent');
  } else {
    appendLog('Failed to send execute message: WebSocket is not open', 'error');
  }
});

clearBtn.addEventListener('click', () => {
  renderer.clearScene();
});

sampleSelect.addEventListener('change', () => {
  const key = sampleSelect.value as SampleKey;
  const sample = SAMPLES[key];
  if (sample) {
    luaEditor.value = sample.code;
    appendLog(`Loaded sample: ${sample.name}`, 'info');
  }
});

renderer.init();
  setTimeout(() => {
    appendLog('Initializing WebSocket connection...', 'info');
    socket.connect();
  }, 500);
  appendLog('Pytha client initialized', 'info');
