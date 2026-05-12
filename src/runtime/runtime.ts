import type {
  PythaHooks,
  ElementHandle,
  Vector3,
  DialogHandle,
  ControlHandle,
} from '../types/element';
import { ElementRegistry } from '../platform/three-platform';
import {
  type ExecutionNode,
  type SequenceNode,
  type DialogNode,
  type CallbackRegistrationNode,
  type OperationNode,
  printTree,
} from './execution-tree';

type RuntimeState = Map<string, unknown>;

export interface RuntimeCallbacks {
  onDialogCreate?: (dialog: DialogHandle) => void;
  onControlEvent?: (controlId: string, eventType: string, value: unknown) => void;
  onError?: (error: Error) => void;
  onLog?: (message: string) => void;
}

export class PythaRuntime {
  private state: RuntimeState = new Map();
  private callbacks: Map<string, Set<(value: unknown) => void>> = new Map();
  private elementRegistry: ElementRegistry;
  private hooks: PythaHooks;
  private callbacks_: RuntimeCallbacks;
  private isRunning = false;
  private currentDialogData: unknown = null;

  constructor(hooks: PythaHooks, callbacks: RuntimeCallbacks = {}) {
    this.hooks = hooks;
    this.callbacks_ = callbacks;
    this.elementRegistry = new ElementRegistry();
  }

  getRegistry(): ElementRegistry {
    return this.elementRegistry;
  }

  getHooks(): PythaHooks {
    return this.hooks;
  }

  async execute(tree: ExecutionNode): Promise<void> {
    if (this.isRunning) {
      throw new Error('Runtime is already running');
    }
    this.isRunning = true;

    try {
      this.log(`Starting execution of tree: ${tree.id}`);
      await this.executeNode(tree);
      this.log('Execution completed');
    } catch (error) {
      this.error(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.isRunning = false;
    }
  }

  private async executeNode(node: ExecutionNode): Promise<void> {
    switch (node.type) {
      case 'sequence':
        await this.executeSequence(node as SequenceNode);
        break;
      case 'dialog':
        await this.executeDialog(node as DialogNode);
        break;
      case 'callback_registration':
        this.registerCallback(node as CallbackRegistrationNode);
        break;
      case 'operation':
        await this.executeOperation(node as OperationNode);
        break;
      case 'loop':
        await this.executeLoop(node);
        break;
      case 'wait':
        await this.executeWait(node);
        break;
      default:
        this.log(`Unknown node type: ${node.type}`);
    }
  }

  private async executeSequence(node: SequenceNode): Promise<void> {
    for (const child of node.children) {
      await this.executeNode(child);
    }
  }

  private async executeDialog(node: DialogNode): Promise<void> {
    const { dialogInitFunc, dataArg } = node.metadata;

    this.log(`Opening dialog: ${dialogInitFunc}`);
    this.currentDialogData = dataArg;

    const dialog = this.hooks.pyui.createDialog();
    this.hooks.pyui.setWindowTitle(dialog, dialogInitFunc);

    this.callbacks_.onDialogCreate?.(dialog);

    const result = await this.hooks.pyui.runModalDialog<unknown>(
      (d, data) => {
        this.currentDialogData = data;
      },
      dataArg
    );

    this.log(`Dialog closed with result`);
    this.currentDialogData = result;

    if (node.metadata.continuation) {
      await this.executeNode(node.metadata.continuation as ExecutionNode);
    }
  }

  private registerCallback(node: CallbackRegistrationNode): void {
    const { eventType, controlId, handler } = node.metadata;

    if (!this.callbacks.has(controlId)) {
      this.callbacks.set(controlId, new Set());
    }

    this.callbacks.get(controlId)!.add((value: unknown) => {
      this.log(`Callback triggered: ${controlId} -> ${eventType} with value`);
      this.callbacks_.onControlEvent?.(controlId, eventType, value);
      this.executeNode(handler);
    });
  }

  private async executeOperation(node: OperationNode): Promise<void> {
    const { apiCall, args } = node.metadata;

    switch (apiCall) {
      case 'pytha.create_block': {
        const [length, width, height, origin, options] = args as [number, number, number, Vector3?, Record<string, unknown>?];
        const handle = this.hooks.pytha.createBlock(length, width, height, origin, options as any);
        this.state.set('__last_result__', handle);
        this.log(`Created block: ${handle.id}`);
        break;
      }
      case 'pytha.create_cylinder': {
        const [height, radius, origin, options] = args as [number, number, Vector3?, Record<string, unknown>?];
        const handle = this.hooks.pytha.createCylinder(height, radius, origin, options as any);
        this.state.set('__last_result__', handle);
        this.log(`Created cylinder: ${handle.id}`);
        break;
      }
      case 'pytha.create_sphere': {
        const [radius, origin, options] = args as [number, Vector3?, Record<string, unknown>?];
        const handle = this.hooks.pytha.createSphere(radius, origin, options as any);
        this.state.set('__last_result__', handle);
        break;
      }
      case 'pytha.create_polygon': {
        const [points] = args as [Vector3[]];
        const handle = this.hooks.pytha.createPolygon(points);
        this.state.set('__last_result__', handle);
        break;
      }
      case 'pytha.create_polyline': {
        const [closed, points] = args as [string, Vector3[]];
        const handle = this.hooks.pytha.createPolyline(closed as 'closed' | 'open', points);
        this.state.set('__last_result__', handle);
        break;
      }
      case 'pytha.delete_element': {
        const [element] = args as [ElementHandle];
        this.hooks.pytha.deleteElement(element);
        this.log(`Deleted element: ${element.id}`);
        break;
      }
      case 'pytha.copy_element': {
        const [element, offset] = args as [ElementHandle, Vector3];
        const handle = this.hooks.pytha.copyElement(element, offset);
        this.state.set('__last_result__', handle);
        break;
      }
      case 'pytha.move_element': {
        const [elements, offset] = args as [ElementHandle | ElementHandle[], Vector3];
        this.hooks.pytha.moveElement(elements, offset);
        break;
      }
      case 'pytha.rotate_element': {
        const [elements, origin, axis, angle] = args as [ElementHandle | ElementHandle[], Vector3, string, number];
        this.hooks.pytha.rotateElement(elements, origin, axis as 'x' | 'y' | 'z', angle);
        break;
      }
      case 'pytha.set_element_name': {
        const [element, name] = args as [ElementHandle, string];
        this.hooks.pytha.setElementName(element, name);
        break;
      }
      case 'pytha.set_element_pen': {
        const [element, penIndex] = args as [ElementHandle, number];
        this.hooks.pytha.setElementPen(element, penIndex);
        break;
      }
      case 'pytha.set_element_material': {
        const [element, material] = args as [ElementHandle, unknown];
        this.hooks.pytha.setElementMaterial(element, material as any);
        break;
      }
      case 'pytha.set_element_group': {
        const [element, group] = args as [ElementHandle, unknown];
        this.hooks.pytha.setElementGroup(element, group as any);
        break;
      }
      case 'pytha.create_group': {
        const [elements, options] = args as [ElementHandle[], Record<string, unknown>?];
        const handle = this.hooks.pytha.createGroup(elements, options as any);
        this.state.set('__last_result__', handle);
        break;
      }
      case 'pytha.get_element_history': {
        const [element, key] = args as [ElementHandle, string];
        const history = this.hooks.pytha.getElementHistory(element, key);
        this.state.set('__last_result__', history);
        break;
      }
      case 'pytha.set_element_history': {
        const [element, data, key] = args as [ElementHandle, unknown, string];
        this.hooks.pytha.setElementHistory(element, data, key);
        break;
      }
      case 'pytha.boole_part_union': {
        const [elements] = args as [ElementHandle[]];
        const result = this.hooks.pytha.booleanUnion(elements);
        this.state.set('__last_result__', result);
        break;
      }
      case 'pyui.alert': {
        const [message] = args as [string];
        this.hooks.pyui.alert(message);
        break;
      }
      case 'pyio.save_values': {
        const [key, data] = args as [string, unknown];
        this.hooks.pyio.saveValues(key, data);
        break;
      }
      case 'pyio.load_values': {
        const [key] = args as [string];
        const data = this.hooks.pyio.loadValues(key);
        this.state.set('__last_result__', data);
        break;
      }
      default:
        this.log(`Unhandled operation: ${apiCall}`);
    }
  }

  private async executeLoop(node: ExecutionNode): Promise<void> {
    const meta = node.metadata;
    const variable = meta.variable as string;
    const iterable = meta.iterable as unknown[];

    if (variable === '__while__') {
      let condition = meta.iterable[0] as { condition: unknown };
      while (condition.condition) {
        await this.executeNode(meta.body as ExecutionNode);
      }
    } else if (variable === '__repeat__') {
      do {
        await this.executeNode(meta.body as ExecutionNode);
      } while (true);
    } else {
      for (const item of iterable) {
        this.state.set(variable, item);
        await this.executeNode(meta.body as ExecutionNode);
      }
    }
  }

  private async executeWait(node: ExecutionNode): Promise<void> {
    const { duration, continuation } = node.metadata;
    await this.hooks.pyui.wait(duration as number);
    if (continuation) {
      await this.executeNode(continuation as ExecutionNode);
    }
  }

  triggerCallback(controlId: string, eventType: string, value: unknown): void {
    const handlers = this.callbacks.get(controlId);
    if (handlers) {
      for (const handler of handlers) {
        handler(value);
      }
    }
  }

  getState(key: string): unknown {
    return this.state.get(key);
  }

  setState(key: string, value: unknown): void {
    this.state.set(key, value);
  }

  getCurrentDialogData(): unknown {
    return this.currentDialogData;
  }

  private log(message: string): void {
    this.callbacks_.onLog?.(message);
  }

  private error(error: Error): void {
    this.callbacks_.onError?.(error);
  }

  stop(): void {
    this.isRunning = false;
  }
}

export { printTree };