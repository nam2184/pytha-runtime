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
import { handleUICreate, removeAllDialogs } from './pyui-client';
import { SAMPLES, type SampleKey } from './sample-code';
import { createPythaSocket } from './ws-client';
import {
  createFile,
  deleteFile,
  renameFile,
  updateFileContent,
  getActiveFile,
  setActiveFile,
  getFileContent,
  getAllFiles,
  downloadAsZip,
  initDefaultFile,
  clearFiles,
} from './file-manager';

const WS_URL = `ws://localhost:${import.meta.env.VITE_WS_PORT ?? 8080}`;

const container = document.getElementById('three-container') as HTMLElement;
const luaEditor = document.getElementById('lua-editor') as HTMLTextAreaElement;
const logPanel = document.getElementById('log-panel') as HTMLElement;
const runBtn = document.getElementById('run-btn') as HTMLButtonElement;
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
const sampleSelect = document.getElementById('sample-select') as HTMLSelectElement;
const fileList = document.getElementById('file-list') as HTMLElement;
const addFileBtn = document.getElementById('add-file-btn') as HTMLButtonElement;
const downloadZipBtn = document.getElementById('download-zip-btn') as HTMLButtonElement;

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

function renderFileList() {
  fileList.innerHTML = '';
  const files = getAllFiles();

  for (const file of files) {
    const item = document.createElement('div');
    item.className = 'file-item';
    if (file.name === getActiveFile()) {
      item.classList.add('active');
    }

    const nameSpan = document.createElement('span');
    nameSpan.className = 'file-item-name';
    nameSpan.textContent = file.name;

    const actions = document.createElement('div');
    actions.className = 'file-item-actions';

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Delete file';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Delete ${file.name}?`)) {
        deleteFile(file.name);
        renderFileList();
      }
    });

    actions.appendChild(deleteBtn);
    item.appendChild(nameSpan);
    item.appendChild(actions);

    item.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.file-item-actions')) return;
      selectFile(file.name);
    });

    fileList.appendChild(item);
  }

  const activeFile = getActiveFile();
  if (activeFile) {
    luaEditor.value = getFileContent(activeFile) || '';
  }
}

function selectFile(name: string) {
  const currentContent = luaEditor.value;
  const activeFile = getActiveFile();
  if (activeFile && activeFile !== name) {
    updateFileContent(activeFile, currentContent);
  }
  setActiveFile(name);
  luaEditor.value = getFileContent(name) || '';
  renderFileList();
}

function showNewFileDialog() {
  const name = prompt('Enter file name (e.g., utils.lua):');
  if (name && name.trim()) {
    const trimmedName = name.trim();
    if (getAllFiles().some(f => f.name === trimmedName)) {
      alert('File already exists!');
      return;
    }
    createFile(trimmedName);
    renderFileList();
  }
}

function saveCurrentFile() {
  const activeFile = getActiveFile();
  if (activeFile) {
    updateFileContent(activeFile, luaEditor.value);
  }
}

function handleRun() {
  saveCurrentFile();

  if (!socket.isOpen()) {
    appendLog('Not connected to server', 'error');
    return;
  }

  clearDialogs();
  renderer.clearScene();

  const files = getAllFiles();
  if (files.length === 0) {
    appendLog('No files to execute', 'error');
    return;
  }

  const executeMsg = {
    type: 'execute',
    files,
    id: `exec_${Date.now()}`,
    timestamp: Date.now(),
  };

  if (socket.send(executeMsg)) {
    appendLog('Executing project...', 'info');
  } else {
    appendLog('Failed to send code', 'error');
  }
}

function clearDialogs() {
  removeAllDialogs();
  if (socket.isOpen()) {
    socket.send({
      type: 'ui_close',
      id: `ui_close_${Date.now()}`,
      timestamp: Date.now(),
    });
  }
}

runBtn.addEventListener('click', handleRun);

clearBtn.addEventListener('click', () => {
  clearDialogs();
  renderer.clearScene();
});

sampleSelect.addEventListener('change', () => {
  const key = sampleSelect.value as SampleKey;
  const sample = SAMPLES[key];
  if (sample) {
    const activeFile = getActiveFile();
    if (activeFile) {
      updateFileContent(activeFile, sample.code);
      luaEditor.value = sample.code;
      renderFileList();
    }
    appendLog(`Loaded sample: ${sample.name}`, 'info');
  }
});

addFileBtn.addEventListener('click', showNewFileDialog);

downloadZipBtn.addEventListener('click', async () => {
  saveCurrentFile();
  await downloadAsZip();
  appendLog('Downloaded project as ZIP', 'info');
});

luaEditor.addEventListener('input', () => {
  saveCurrentFile();
});

luaEditor.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = luaEditor.selectionStart;
    const end = luaEditor.selectionEnd;
    const value = luaEditor.value;
    luaEditor.value = value.substring(0, start) + '    ' + value.substring(end);
    luaEditor.selectionStart = luaEditor.selectionEnd = start + 4;
  }
});

initDefaultFile();
renderFileList();
populateSampleSelect();

function populateSampleSelect() {
  sampleSelect.innerHTML = '';
  for (const [key, sample] of Object.entries(SAMPLES)) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = sample.name;
    sampleSelect.appendChild(option);
  }
}

renderer.init();
setTimeout(() => {
  appendLog('Initializing WebSocket connection...', 'info');
  socket.connect();
}, 500);
appendLog('Pytha client initialized', 'info');
