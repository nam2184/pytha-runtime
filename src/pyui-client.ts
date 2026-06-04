import type { UICreateMessage } from '@/shared/protocol';
import type { SendMessage } from '@/src/client-types';

export function handleUICreate(msg: UICreateMessage, send: SendMessage) {
  const controlTopOffset = 32;
  const dialogEl = document.createElement('div');
  dialogEl.className = 'pytha-dialog';
  dialogEl.dataset.dialogId = msg.dialogId;
  dialogEl.style.position = 'fixed';
  dialogEl.style.left = '50%';
  dialogEl.style.top = '50%';
  dialogEl.style.transform = 'translate(-50%, -50%)';
  dialogEl.style.zIndex = '1000';
  dialogEl.style.width = '320px';
  dialogEl.style.minHeight = '180px';
  dialogEl.style.background = '#2a2a2a';
  dialogEl.style.borderRadius = '8px';
  dialogEl.style.boxShadow = '0 8px 32px rgba(0,0,0,0.5)';
  dialogEl.style.padding = '12px';

  const dragHandle = document.createElement('div');
  dragHandle.textContent = 'Dialog';
  dragHandle.style.position = 'absolute';
  dragHandle.style.left = '0';
  dragHandle.style.top = '0';
  dragHandle.style.right = '0';
  dragHandle.style.height = '26px';
  dragHandle.style.padding = '6px 10px';
  dragHandle.style.background = '#1a1a1a';
  dragHandle.style.borderRadius = '8px 8px 0 0';
  dragHandle.style.color = '#bbb';
  dragHandle.style.fontSize = '12px';
  dragHandle.style.fontWeight = '600';
  dragHandle.style.cursor = 'move';
  dragHandle.style.userSelect = 'none';
  dialogEl.appendChild(dragHandle);
  makeDraggable(dialogEl, dragHandle);

  for (const ctrl of msg.controls) {
    const ctrlDiv = document.createElement('div');
    ctrlDiv.className = `pytha-control pytha-control-${ctrl.type}`;
    ctrlDiv.dataset.controlId = ctrl.id;
    ctrlDiv.dataset.dialogId = msg.dialogId;

    const [x, y] = ctrl.position;
    ctrlDiv.style.position = 'absolute';
    ctrlDiv.style.left = `${x}px`;
    ctrlDiv.style.top = `${y + controlTopOffset}px`;

    if (ctrl.type === 'label') {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'pytha-input pytha-label';
      input.value = ctrl.label || '';
      input.disabled = true;
      input.style.width = '150px';
      ctrlDiv.appendChild(input);
    }
    else if (ctrl.type === 'text_box') {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'pytha-input';
      input.value = ctrl.value || '';
      input.style.width = '200px';
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
      btn.style.background = '#0066cc';
      btn.style.color = 'white';
      btn.style.border = 'none';
      btn.style.borderRadius = '4px';
      btn.style.padding = '8px 16px';
      btn.style.cursor = 'pointer';
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

      const label = document.createElement('span');
      label.textContent = ctrl.label || '';
      label.style.marginLeft = '5px';
      label.style.color = '#e0e0e0';

      ctrlDiv.appendChild(input);
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
      select.style.background = '#1a1a1a';
      select.style.color = '#e0e0e0';
      select.style.border = '1px solid #444';
      select.style.borderRadius = '4px';
      select.style.padding = '8px';
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

    dialogEl.appendChild(ctrlDiv);
  }

  document.body.appendChild(dialogEl);
}

function makeDraggable(dialogEl: HTMLElement, dragHandle: HTMLElement) {
  let dragging = false;
  let startPointerX = 0;
  let startPointerY = 0;
  let startLeft = 0;
  let startTop = 0;

  dragHandle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;

    const rect = dialogEl.getBoundingClientRect();
    dialogEl.style.transform = 'none';
    dialogEl.style.left = `${rect.left}px`;
    dialogEl.style.top = `${rect.top}px`;

    dragging = true;
    startPointerX = event.clientX;
    startPointerY = event.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    dragHandle.setPointerCapture(event.pointerId);
  });

  dragHandle.addEventListener('pointermove', (event) => {
    if (!dragging) return;

    dialogEl.style.left = `${startLeft + event.clientX - startPointerX}px`;
    dialogEl.style.top = `${startTop + event.clientY - startPointerY}px`;
  });

  dragHandle.addEventListener('pointerup', (event) => {
    dragging = false;
    dragHandle.releasePointerCapture(event.pointerId);
  });
}

export function removeDialog(dialogId: string) {
  const dialog = document.querySelector(`[data-dialog-id="${dialogId}"]`);
  if (dialog && dialog.parentNode) {
    dialog.parentNode.removeChild(dialog);
  }
}

export function removeAllDialogs() {
  for (const dialog of document.querySelectorAll('.pytha-dialog')) {
    dialog.parentNode?.removeChild(dialog);
  }
}
