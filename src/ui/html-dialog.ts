import type { DialogHandle, ControlHandle, Vector2 } from '../types/element';

let dialogIdCounter = 0;
let controlIdCounter = 0;

function generateDialogId(): string {
  return `dialog_${++dialogIdCounter}`;
}

function generateControlId(): string {
  return `ctrl_${++controlIdCounter}`;
}

export type LuaClosure = (...args: unknown[]) => void;

export class HTMLUIPlatform {
  private changeHandlers = new Map<string, LuaClosure[]>();
  private clickHandlers = new Map<string, LuaClosure[]>();
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
      selectedIndex: 0,
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

  setOnChangeHandler(control: ControlHandle, handler: LuaClosure): void {
    const handlers = this.changeHandlers.get(control.id) || [];
    handlers.push(handler);
    this.changeHandlers.set(control.id, handlers);
  }

  setOnClickHandler(control: ControlHandle, handler: LuaClosure): void {
    const handlers = this.clickHandlers.get(control.id) || [];
    handlers.push(handler);
    this.clickHandlers.set(control.id, handlers);
  }

  runModalDialog(
    initFunc: (dialog: DialogHandle, data: unknown) => void,
    data: unknown
  ): void {
    const dialog = this.createDialog();
    initFunc(dialog, data);
    this.showDialog(dialog, data);
  }

  private showDialog(dialog: DialogHandle, data: unknown): void {
    const dialogEl = document.createElement('div');
    dialogEl.className = 'pytha-dialog';

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

    for (const [id, control] of dialog.controls) {
      const ctrlDiv = document.createElement('div');
      ctrlDiv.className = `pytha-control pytha-control-${control.controlType}`;
      content.appendChild(ctrlDiv);

      if (control.controlType === 'text_box' || control.controlType === 'label') {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'pytha-input';
        input.value = (control as { value: string }).value || '';
        if (control.controlType === 'label') {
          input.disabled = true;
        }
        ctrlDiv.appendChild(input);

        input.addEventListener('input', () => {
          const handlers = this.changeHandlers.get(id);
          if (handlers) {
            handlers.forEach(h => h(input.value));
          }
        });
      }

      if (control.controlType === 'check_box') {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'pytha-input';
        input.checked = (control as { checked: boolean }).checked;
        ctrlDiv.appendChild(input);

        input.addEventListener('change', () => {
          const handlers = this.changeHandlers.get(id);
          if (handlers) {
            handlers.forEach(h => h(input.checked));
          }
        });
      }

      if (control.controlType === 'button') {
        const btn = document.createElement('button');
        btn.className = 'pytha-dialog-button';
        btn.textContent = (control as { value: string }).value || 'Button';
        ctrlDiv.appendChild(btn);

        btn.addEventListener('click', () => {
          const handlers = this.clickHandlers.get(id);
          if (handlers) {
            handlers.forEach(h => h());
          }
        });
      }

      if (control.controlType === 'ok' || control.controlType === 'cancel') {
        const btn = document.createElement('button');
        btn.className = `pytha-dialog-button pytha-dialog-${control.controlType}`;
        btn.textContent = control.controlType === 'ok' ? 'OK' : 'Cancel';
        footer.appendChild(btn);
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
      this.removeDialog(dialogEl);
    });

    cancelBtn.addEventListener('click', () => {
      this.removeDialog(dialogEl);
    });

    document.body.appendChild(dialogEl);
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

  runModalSubdialog(
    parentDialog: DialogHandle,
    initFunc: (dialog: DialogHandle, data: unknown) => void,
    data: unknown
  ): void {
    const dialog = this.createDialog();
    initFunc(dialog, data);
    this.showDialog(dialog, data);
  }

  endModalCancel(dialog: DialogHandle): void {
  }

  setControlText(control: ControlHandle, text: string): void {
    const ctrl = this.controls.get(control.id);
    if (ctrl && ctrl.controlType === 'text_box') {
      (ctrl as { value: string }).value = text;
    }
  }

  setControlChecked(control: ControlHandle, checked: boolean): void {
    const ctrl = this.controls.get(control.id);
    if (ctrl && ctrl.controlType === 'check_box') {
      (ctrl as { checked: boolean }).checked = checked;
    }
  }

  clearControlItems(control: ControlHandle): void {
    const ctrl = this.controls.get(control.id);
    if (ctrl && (ctrl.controlType === 'combo_box' || ctrl.controlType === 'list_box')) {
      (ctrl as { items: string[] }).items = [];
    }
  }

  equalizeColumnWidths(dialog: DialogHandle, columns: number[]): void {
  }

  createAlign(dialog: DialogHandle, columns: number[]): void {
  }

  getChangeHandlers(controlId: string): LuaClosure[] {
    return this.changeHandlers.get(controlId) || [];
  }

  getClickHandlers(controlId: string): LuaClosure[] {
    return this.clickHandlers.get(controlId) || [];
  }

  private removeDialog(element: HTMLElement): void {
    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
  }
}
