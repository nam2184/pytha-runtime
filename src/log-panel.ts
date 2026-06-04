import type { LogType } from '@/src/client-types';

export function createLogAppender(logPanel: HTMLElement) {
  return (message: string, type: LogType = 'normal') => {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logPanel.appendChild(entry);
    logPanel.scrollTop = logPanel.scrollHeight;
  };
}
