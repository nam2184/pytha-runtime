import type { UICreateMessage } from '../server/protocol';
import type { SendMessage } from './client-types';

export function handleUICreate(msg: UICreateMessage, send: SendMessage) {
  const dialogEl = document.createElement('div');
  dialogEl.className = 'pytha-dialog';
  dialogEl.dataset.dialogId = msg.dialogId;

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

  for (const ctrl of msg.controls) {
    const ctrlDiv = document.createElement('div');
    ctrlDiv.className = `pytha-control pytha-control-${ctrl.type}`;
    ctrlDiv.dataset.controlId = ctrl.id;
    ctrlDiv.dataset.dialogId = msg.dialogId;
    content.appendChild(ctrlDiv);

    if (ctrl.type === 'label') {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'pytha-input pytha-label';
      input.value = ctrl.label || '';
      input.disabled = true;
      ctrlDiv.appendChild(input);
    }
    else if (ctrl.type === 'text_box') {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'pytha-input';
      input.value = ctrl.value || '';
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
      ctrlDiv.appendChild(input);

      const label = document.createElement('span');
      label.textContent = ctrl.label || '';
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
    dialogEl.parentNode?.removeChild(dialogEl);
    send({
      type: 'ui_event',
      dialogId: msg.dialogId,
      controlId: 'ok',
      eventType: 'click',
      value: undefined,
    });
  });

  cancelBtn.addEventListener('click', () => {
    dialogEl.parentNode?.removeChild(dialogEl);
    send({
      type: 'ui_event',
      dialogId: msg.dialogId,
      controlId: 'cancel',
      eventType: 'click',
      value: undefined,
    });
  });

  document.body.appendChild(dialogEl);
}
