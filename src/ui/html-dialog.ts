import type { DialogHandle, ControlHandle, Vector3, Vector2, MaterialHandle } from '../types/element';

let dialogIdCounter = 0;
let controlIdCounter = 0;

function generateDialogId(): string {
  return `dialog_${++dialogIdCounter}`;
}

function generateControlId(): string {
  return `ctrl_${++controlIdCounter}`;
}

type ChangeHandler = (value: unknown) => void;
type ClickHandler = () => void;

export class HTMLUIPlatform {
  private currentDialogResolve: ((value: unknown) => void) | null = null;
  private changeHandlers = new Map<string, Set<ChangeHandler>>();
  private clickHandlers = new Map<string, Set<ClickHandler>>();
  private dialogs = new Map<string, DialogHandle>();
  private controls = new Map<string, ControlHandle>();

  createDialog(): DialogHandle {
    const dialog: DialogHandle = {
      _type: 'dialog',
      id: generateDialogId(),
      controls: new Map(),
    };
    this.dialogs.set(dialog.id, dialog);
    return dialog;
  }

  setWindowTitle(dialog: DialogHandle, title: string): void {
    dialog.id = dialog.id;
  }

  async runModalDialog<T>(
    initFunc: (dialog: DialogHandle, data: T) => void,
    data: T
  ): Promise<T> {
    return new Promise<T>((resolve) => {
      const dialog = this.createDialog();

      const controls = this.createHTMLElement('div', {
        className: 'pytha-dialog',
        parent: document.body,
      });

      const titleBar = this.createHTMLElement('div', {
        className: 'pytha-dialog-title',
        textContent: 'Dialog',
        parent: controls,
      });

      const content = this.createHTMLElement('div', {
        className: 'pytha-dialog-content',
        parent: controls,
      });

      const footer = this.createHTMLElement('div', {
        className: 'pytha-dialog-footer',
        parent: controls,
      });

      const okButton = this.createHTMLElement('button', {
        textContent: 'OK',
        className: 'pytha-dialog-button pytha-dialog-ok',
        parent: footer,
        onClick: () => {
          this.removeDialog(controls);
          resolve(data);
        },
      });

      const cancelButton = this.createHTMLElement('button', {
        textContent: 'Cancel',
        className: 'pytha-dialog-button pytha-dialog-cancel',
        parent: footer,
        onClick: () => {
          this.removeDialog(controls);
          resolve(data);
        },
      });

      const wrappedDialog: DialogHandle = {
        ...dialog,
        controls: dialog.controls,
      };

      try {
        initFunc(wrappedDialog, data);
      } catch (e) {
        console.error('Error in dialog init:', e);
      }

      for (const [id, control] of dialog.controls) {
        const ctrlDiv = this.createHTMLElement('div', {
          className: `pytha-control pytha-control-${control.controlType}`,
          parent: content,
        });

        if ('value' in control) {
          const input = this.createHTMLElement('input', {
            type: control.controlType === 'check_box' ? 'checkbox' : 'text',
            className: 'pytha-input',
            parent: ctrlDiv,
          });

          if (control.controlType === 'check_box') {
            (input as HTMLInputElement).checked = (control as { checked: boolean }).checked;
          } else {
            (input as HTMLInputElement).value = (control as { value: string }).value;
          }

          input.addEventListener('input', () => {
            const handlers = this.changeHandlers.get(id);
            if (handlers) {
              const value = control.controlType === 'check_box'
                ? (input as HTMLInputElement).checked
                : (input as HTMLInputElement).value;
              handlers.forEach(h => h(value));
            }
          });
        }

        if (control.controlType === 'ok' || control.controlType === 'cancel') {
          (ctrlDiv as HTMLDivElement & { _pythaButton: string })._pythaButton = control.controlType;

          const btn = ctrlDiv.querySelector('button') || this.createHTMLElement('button', {
            textContent: control.controlType === 'ok' ? 'OK' : 'Cancel',
            className: `pytha-dialog-button pytha-dialog-${control.controlType}`,
            parent: ctrlDiv,
          });

          btn.addEventListener('click', () => {
            const handlers = this.clickHandlers.get(id);
            if (handlers) {
              handlers.forEach(h => h());
            }
          });
        }
      }

      this.currentDialogResolve = resolve as (value: unknown) => void;
    });
  }

  createLabel(dialog: DialogHandle, position: number | Vector2, text: string): ControlHandle {
    const control: ControlHandle = {
      _type: 'control',
      id: generateControlId(),
      controlType: 'label',
      value: text,
    };
    dialog.controls.set(control.id, control);
    this.controls.set(control.id, control);
    return control;
  }

  createTextBox(dialog: DialogHandle, position: number | Vector2, value: string): ControlHandle {
    const control: ControlHandle = {
      _type: 'text_box',
      id: generateControlId(),
      controlType: 'text_box',
      value,
    };
    dialog.controls.set(control.id, control);
    this.controls.set(control.id, control);
    return control;
  }

  createButton(dialog: DialogHandle, position: number | Vector2, label: string): ControlHandle {
    const control: ControlHandle = {
      _type: 'button',
      id: generateControlId(),
      controlType: 'button',
      value: label,
    };
    dialog.controls.set(control.id, control);
    this.controls.set(control.id, control);
    return control;
  }

  createCheckBox(dialog: DialogHandle, position: number | Vector2, label: string): ControlHandle {
    const control: ControlHandle = {
      _type: 'check_box',
      id: generateControlId(),
      controlType: 'check_box',
      checked: false,
    };
    dialog.controls.set(control.id, control);
    this.controls.set(control.id, control);
    return control;
  }

  createComboBox(dialog: DialogHandle, position: number | Vector2, items: string[]): ControlHandle {
    const control: ControlHandle = {
      _type: 'combo_box',
      id: generateControlId(),
      controlType: 'combo_box',
      value: items[0],
    };
    dialog.controls.set(control.id, control);
    this.controls.set(control.id, control);
    return control;
  }

  createListBox(dialog: DialogHandle, position: number | Vector2, items: string[]): ControlHandle {
    const control: ControlHandle = {
      _type: 'list_box',
      id: generateControlId(),
      controlType: 'list_box',
      items,
    };
    dialog.controls.set(control.id, control);
    this.controls.set(control.id, control);
    return control;
  }

  createOkButton(dialog: DialogHandle, position: number | Vector2): ControlHandle {
    const control: ControlHandle = {
      _type: 'button',
      id: generateControlId(),
      controlType: 'ok',
    };
    dialog.controls.set(control.id, control);
    this.controls.set(control.id, control);
    return control;
  }

  createCancelButton(dialog: DialogHandle, position: number | Vector2): ControlHandle {
    const control: ControlHandle = {
      _type: 'button',
      id: generateControlId(),
      controlType: 'cancel',
    };
    dialog.controls.set(control.id, control);
    this.controls.set(control.id, control);
    return control;
  }

  setOnChangeHandler(control: ControlHandle, handler: (value: unknown) => void): void {
    if (!this.changeHandlers.has(control.id)) {
      this.changeHandlers.set(control.id, new Set());
    }
    this.changeHandlers.get(control.id)!.add(handler);
  }

  setOnClickHandler(control: ControlHandle, handler: () => void): void {
    if (!this.clickHandlers.has(control.id)) {
      this.clickHandlers.set(control.id, new Set());
    }
    this.clickHandlers.get(control.id)!.add(handler);
  }

  alert(message: string): void {
    console.log('[PYUI Alert]', message);
  }

  async wait(milliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
  }

  formatLength(value: number): string {
    return `${value.toFixed(2)} mm`;
  }

  parseLength(text: string): number | undefined {
    const match = text.match(/^([\d.]+)/);
    if (match) {
      return parseFloat(match[1]);
    }
    return undefined;
  }

  formatNumber(value: number): string {
    return value.toString();
  }

  parseNumber(text: string): number | undefined {
    const num = parseFloat(text);
    return isNaN(num) ? undefined : num;
  }

  runModalSubdialog<T, R>(parentDialog: DialogHandle, initFunc: (dialog: DialogHandle, data: T) => void, data: T): Promise<R> {
    return this.runModalDialog(initFunc, data) as Promise<R>;
  }

  endModalCancel(dialog: DialogHandle): void {
    if (this.currentDialogResolve) {
      this.currentDialogResolve(null);
      this.currentDialogResolve = null;
    }
  }

  setControlText(control: ControlHandle, text: string): void {
    const ctrl = this.controls.get(control.id);
    if (ctrl && 'value' in ctrl) {
      (ctrl as { value: string }).value = text;
    }
  }

  setControlChecked(control: ControlHandle, checked: boolean): void {
    const ctrl = this.controls.get(control.id);
    if (ctrl && ctrl._type === 'check_box') {
      (ctrl as { checked: boolean }).checked = checked;
    }
  }

  clearControlItems(control: ControlHandle): void {
    const ctrl = this.controls.get(control.id);
    if (ctrl && 'items' in ctrl) {
      (ctrl as { items: string[] }).items = [];
    }
  }

  equalizeColumnWidths(dialog: DialogHandle, columns: number[]): void {
  }

  createAlign(dialog: DialogHandle, columns: number[]): void {
  }

  private createHTMLElement<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    options: {
      className?: string;
      textContent?: string;
      parent?: HTMLElement;
      onClick?: () => void;
    } & Record<string, unknown>
  ): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);

    if (options.className) el.className = options.className;
    if (options.textContent) el.textContent = options.textContent;
    if (options.parent) options.parent.appendChild(el);
    if (options.onClick) el.addEventListener('click', options.onClick);

    return el;
  }

  private removeDialog(element: HTMLElement): void {
    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
  }
}