import 'dotenv/config';
import {
  dispatchJsonRpc,
  type JsonRpcId,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from './mcp_core.js';

function send(message: unknown) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function sendResponse(message: JsonRpcResponse) {
  send(message);
}

let inputBuffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  inputBuffer += chunk;
  let newlineIndex = inputBuffer.indexOf('\n');
  while (newlineIndex !== -1) {
    const line = inputBuffer.slice(0, newlineIndex).trim();
    inputBuffer = inputBuffer.slice(newlineIndex + 1);
    newlineIndex = inputBuffer.indexOf('\n');

    if (!line) continue;

    try {
      const request = JSON.parse(line) as JsonRpcRequest;
      const id: JsonRpcId = request.id ?? null;
      void (async () => {
        const response = await dispatchJsonRpc(request);
        if (response !== null) {
          // Force id to round-trip even when dispatch didn't echo it back.
          sendResponse({ ...response, id: response.id ?? id });
        }
      })();
    } catch (error) {
      send({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: error instanceof Error ? error.message : String(error) },
      });
    }
  }
});

process.stdin.on('end', () => {
  process.exitCode = 0;
});
