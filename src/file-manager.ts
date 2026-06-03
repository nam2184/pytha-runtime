import JSZip from 'jszip';

export interface LuaFile {
  name: string;
  content: string;
}

export interface FileManager {
  files: Map<string, string>;
  activeFile: string | null;
}

const fileManager: FileManager = {
  files: new Map(),
  activeFile: null,
};

export function createFile(name: string, content: string = ''): void {
  const fileName = name.endsWith('.lua') ? name : `${name}.lua`;
  fileManager.files.set(fileName, content);
  if (!fileManager.activeFile) {
    fileManager.activeFile = fileName;
  }
}

export function deleteFile(name: string): void {
  fileManager.files.delete(name);
  if (fileManager.activeFile === name) {
    const firstKey = fileManager.files.keys().next().value;
    fileManager.activeFile = firstKey ?? null;
  }
}

export function renameFile(oldName: string, newName: string): void {
  if (!fileManager.files.has(oldName)) return;
  const content = fileManager.files.get(oldName)!;
  const newFileName = newName.endsWith('.lua') ? newName : `${newName}.lua`;
  fileManager.files.delete(oldName);
  fileManager.files.set(newFileName, content);
  if (fileManager.activeFile === oldName) {
    fileManager.activeFile = newFileName;
  }
}

export function updateFileContent(name: string, content: string): void {
  if (fileManager.files.has(name)) {
    fileManager.files.set(name, content);
  }
}

export function getActiveFile(): string | null {
  return fileManager.activeFile;
}

export function setActiveFile(name: string): void {
  if (fileManager.files.has(name)) {
    fileManager.activeFile = name;
  }
}

export function getFileContent(name: string): string | undefined {
  return fileManager.files.get(name);
}

export function getAllFiles(): LuaFile[] {
  return Array.from(fileManager.files.entries())
    .map(([name, content]) => ({ name, content }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function downloadAsZip(): Promise<void> {
  const zip = new JSZip();
  const files = getAllFiles();

  for (const file of files) {
    zip.file(file.name, file.content);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pytha-project.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function initDefaultFile(): void {
  if (fileManager.files.size === 0) {
    createFile('main.lua', `-- Pytha Lua Project
function main()
    pyui.alert("Hello from Pytha!")

    local block = pytha.create_block(100, 100, 100, {0, 0, 0})
    pytha.set_element_name(block, "My Block")
end`);
  }
}

export function getFiles(): Map<string, string> {
  return fileManager.files;
}

export function clearFiles(): void {
  fileManager.files.clear();
  fileManager.activeFile = null;
}

export function getConcatenatedCode(): string {
  return getAllFiles()
    .map(f => f.content)
    .join('\n');
}