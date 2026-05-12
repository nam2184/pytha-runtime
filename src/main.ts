import { PythaRuntimeClient } from './index';

const container = document.getElementById('three-container') as HTMLElement;
const luaEditor = document.getElementById('lua-editor') as HTMLTextAreaElement;
const logPanel = document.getElementById('log-panel') as HTMLElement;
const runBtn = document.getElementById('run-btn') as HTMLButtonElement;
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
const sampleBtn = document.getElementById('sample-btn') as HTMLButtonElement;

function appendLog(message: string, type: 'info' | 'error' | 'normal' = 'normal') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logPanel.appendChild(entry);
  logPanel.scrollTop = logPanel.scrollHeight;
}

let client: PythaRuntimeClient;

async function initClient() {
  client = new PythaRuntimeClient({
    container,
    onLog: (msg) => appendLog(msg),
    onError: (err) => appendLog(`ERROR: ${err.message}`, 'error'),
    onDialogCreate: (dialog) => {
      appendLog('Dialog opened', 'info');
    },
  });
}

runBtn.addEventListener('click', async () => {
  const code = luaEditor.value;
  if (!code.trim()) {
    appendLog('No code to execute', 'error');
    return;
  }

  appendLog('Executing Lua code...', 'info');

  try {
    await client.executeLua(code);
    appendLog('Execution completed', 'info');
  } catch (error) {
    appendLog(`Error: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
});

clearBtn.addEventListener('click', () => {
  appendLog('Clearing scene...', 'info');
  location.reload();
});

sampleBtn.addEventListener('click', () => {
  const sampleCode = `-- Simple block with dialog
function main()
    local data = {size = 100, name = "Test Block"}

    pyui.alert("Creating block with size: " .. tostring(data.size))

    local axis_opts = {
        u_axis = {1, 0, 0},
        v_axis = {0, 1, 0}
    }

    local block = pytha.create_block(data.size, data.size, data.size, {0, 0, 0}, axis_opts)
    pytha.set_element_name(block, data.name)
end`;

  luaEditor.value = sampleCode;
  appendLog('Sample code loaded', 'info');
});

initClient().then(() => {
  appendLog('Pytha Runtime initialized with Fengari', 'info');
  appendLog('Lua 5.3 support: tables, functions, loops, coroutines', 'info');
});