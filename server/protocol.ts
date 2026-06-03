export type MessageType =
  | 'execute'
  | 'ping'
  | 'pong'
  | 'result'
  | 'error'
  | 'render'
  | 'ui_create'
  | 'ui_event'
  | 'ui_close'
  | 'log';

export interface BaseMessage {
  type: MessageType;
  id: string;
  timestamp: number;
}

export interface ExecuteMessage extends BaseMessage {
  type: 'execute';
  files?: Array<{ name: string; content: string }>;
  code?: string;
}

export interface PingMessage extends BaseMessage {
  type: 'ping';
  timestamp: number;
}

export interface PongMessage extends BaseMessage {
  type: 'pong';
  timestamp: number;
}

export interface ResultMessage extends BaseMessage {
  type: 'result';
  success: boolean;
  data?: unknown;
}

export interface ErrorMessage extends BaseMessage {
  type: 'error';
  message: string;
}

export interface RenderMessage extends BaseMessage {
  type: 'render';
  action: 'create' | 'update' | 'delete' | 'clear';
  elementType: 'block' | 'cylinder' | 'sphere' | 'polygon' | 'polyline' | 'group';
  data: Record<string, unknown>;
}

export interface UICreateMessage extends BaseMessage {
  type: 'ui_create';
  dialogId: string;
  controls: Array<{
    id: string;
    type: 'label' | 'text_box' | 'button' | 'check_box' | 'combo_box' | 'list_box';
    label?: string;
    value?: string;
    checked?: boolean;
    items?: string[];
    position: [number, number];
  }>;
}

export interface UIEventMessage extends BaseMessage {
  type: 'ui_event';
  dialogId: string;
  controlId: string;
  eventType: 'change' | 'click';
  value?: unknown;
}

export interface LogMessage extends BaseMessage {
  type: 'log';
  level: 'info' | 'error' | 'debug';
  message: string;
}

export type ClientMessage = ExecuteMessage | PingMessage | UIEventMessage;

export type ServerMessage = ResultMessage | ErrorMessage | RenderMessage | UICreateMessage | LogMessage | PongMessage;

export function createMessage<T extends BaseMessage>(type: T['type'], data: Omit<T, 'type' | 'id' | 'timestamp'>): T {
  return {
    type,
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    ...data,
  } as T;
}