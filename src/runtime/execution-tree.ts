import type { ElementHandle, Vector3 } from '../types/element';

export type NodeType =
  | 'sequence'
  | 'dialog'
  | 'callback_registration'
  | 'operation'
  | 'wait'
  | 'loop'
  | 'conditional';

export interface ExecutionNode {
  id: string;
  type: NodeType;
  children: ExecutionNode[];
  metadata: Record<string, unknown>;
}

export interface SequenceNode extends ExecutionNode {
  type: 'sequence';
}

export interface DialogNode extends ExecutionNode {
  type: 'dialog';
  metadata: {
    dialogInitFunc: string;
    dataArg: unknown;
    continuation: ExecutionNode | null;
  };
}

export interface CallbackRegistrationNode extends ExecutionNode {
  type: 'callback_registration';
  metadata: {
    eventType: 'change' | 'click' | 'left_click' | 'right_click' | 'dragmove' | 'dragstart' | 'dragend' | 'arrow';
    controlId: string;
    handler: ExecutionNode;
  };
}

export interface OperationNode extends ExecutionNode {
  type: 'operation';
  metadata: {
    apiCall: string;
    args: unknown[];
  };
}

export interface WaitNode extends ExecutionNode {
  type: 'wait';
  metadata: {
    duration: number;
    continuation: ExecutionNode | null;
  };
}

export interface LoopNode extends ExecutionNode {
  type: 'loop';
  metadata: {
    variable: string;
    iterable: unknown[];
    body: ExecutionNode;
  };
}

let nodeIdCounter = 0;

export function createNode(type: NodeType, metadata: Record<string, unknown> = {}): ExecutionNode {
  return {
    id: `node_${++nodeIdCounter}`,
    type,
    children: [],
    metadata,
  };
}

export function createSequenceNode(children: ExecutionNode[] = []): SequenceNode {
  return {
    ...createNode('sequence'),
    type: 'sequence',
    children,
  };
}

export function createDialogNode(
  dialogInitFunc: string,
  dataArg: unknown,
  continuation: ExecutionNode | null = null
): DialogNode {
  return {
    ...createNode('dialog'),
    type: 'dialog',
    metadata: {
      dialogInitFunc,
      dataArg,
      continuation,
    },
  };
}

export function createCallbackNode(
  eventType: CallbackRegistrationNode['metadata']['eventType'],
  controlId: string,
  handler: ExecutionNode
): CallbackRegistrationNode {
  return {
    ...createNode('callback_registration'),
    type: 'callback_registration',
    metadata: {
      eventType,
      controlId,
      handler,
    },
  };
}

export function createOperationNode(apiCall: string, args: unknown[]): OperationNode {
  return {
    ...createNode('operation'),
    type: 'operation',
    metadata: {
      apiCall,
      args,
    },
  };
}

export function createWaitNode(duration: number, continuation: ExecutionNode | null): WaitNode {
  return {
    ...createNode('wait'),
    type: 'wait',
    metadata: {
      duration,
      continuation,
    },
  };
}

export function createLoopNode(
  variable: string,
  iterable: unknown[],
  body: ExecutionNode
): LoopNode {
  return {
    ...createNode('loop'),
    type: 'loop',
    metadata: {
      variable,
      iterable,
      body,
    },
  };
}

export function printTree(node: ExecutionNode, indent = 0): string {
  const prefix = '  '.repeat(indent);
  let result = `${prefix}[${node.type}] `;

  if (node.type === 'operation') {
    result += `${node.metadata.apiCall}(${(node.metadata.args as unknown[]).map(a => JSON.stringify(a)).join(', ')})`;
  } else if (node.type === 'dialog') {
    result += `dialog: ${node.metadata.dialogInitFunc}`;
  } else if (node.type === 'callback_registration') {
    result += `${node.metadata.controlId} -> ${node.metadata.eventType}`;
  } else {
    result += Object.keys(node.metadata).length > 0 ? JSON.stringify(node.metadata) : '';
  }

  result += '\n';

  for (const child of node.children) {
    result += printTree(child, indent + 1);
  }

  if (node.metadata.continuation && typeof node.metadata.continuation === 'object' && 'type' in (node.metadata.continuation as ExecutionNode)) {
    result += `${prefix}  -> continuation:\n`;
    result += printTree(node.metadata.continuation as ExecutionNode, indent + 2);
  }

  return result;
}