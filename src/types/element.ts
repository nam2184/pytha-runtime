export interface Vector3 {
  0: number;
  1: number;
  2: number;
}

export interface Vector2 {
  0: number;
  1: number;
}

export interface ElementHandle {
  readonly _type: 'element';
  readonly id: string;
  readonly elementType: string;
}

export interface GroupHandle extends ElementHandle {
  readonly _groupType: true;
  children: ElementHandle[];
}

export interface PartHandle extends ElementHandle {
  readonly _partType: true;
  geometry: unknown;
  material: unknown;
}

export interface MaterialHandle {
  readonly _type: 'material';
  id: string;
  name: string;
}

export interface LayerHandle {
  readonly _type: 'layer';
  id: string;
  name: string;
}

export interface DialogHandle {
  readonly _type: 'dialog';
  id: string;
  controls: Map<string, ControlHandle>;
}

export type ControlHandle =
  | { _type: 'control'; id: string; controlType: string; value: unknown }
  | { _type: 'button'; id: string; controlType: 'button' | 'ok' | 'cancel'; value?: string }
  | { _type: 'text_box'; id: string; controlType: 'text_box'; value: string }
  | { _type: 'check_box'; id: string; controlType: 'check_box'; checked: boolean }
  | { _type: 'combo_box'; id: string; controlType: 'combo_box'; selectedIndex: number }
  | { _type: 'list_box'; id: string; controlType: 'list_box'; items: string[] };

export interface PythaOptions {
  u_axis?: Vector3;
  v_axis?: Vector3;
  w_axis?: Vector3;
  name?: string;
  segments?: number;
  height_segments?: number;
  top_radius?: number;
}

export type ElementType =
  | 'block'
  | 'cylinder'
  | 'sphere'
  | 'profile'
  | 'polyline'
  | 'polygon'
  | 'group'
  | 'part'
  | 'unknown';

export interface PythaRuntimeHooks {
  createBlock(length: number, width: number, height: number, origin?: Vector3, options?: PythaOptions): ElementHandle;
  createCylinder(height: number, radius: number, origin?: Vector3, options?: PythaOptions): ElementHandle;
  createSphere(radius: number, origin?: Vector3, options?: PythaOptions): ElementHandle;
  createPolygon(points: Vector3[]): ElementHandle;
  createPolyline(closed: 'closed' | 'open', points: Vector3[]): ElementHandle;
  createProfile(contour: ElementHandle, height: number): ElementHandle;
  createGroup(elements: ElementHandle[], options?: { name?: string }): GroupHandle;

  deleteElement(element: ElementHandle | ElementHandle[]): void;
  copyElement(element: ElementHandle, offset: Vector3): ElementHandle;
  moveElement(element: ElementHandle | ElementHandle[], offset: Vector3): void;
  rotateElement(element: ElementHandle | ElementHandle[], origin: Vector3, axis: 'x' | 'y' | 'z', angle: number): void;
  mirrorElement(element: ElementHandle, origin: Vector3, axis: 'x' | 'y' | 'z'): void;

  setElementName(element: ElementHandle, name: string): void;
  setElementPen(element: ElementHandle, penIndex: number): void;
  setElementMaterial(element: ElementHandle, material: MaterialHandle): void;
  setElementLayer(element: ElementHandle, layer: LayerHandle): void;
  setElementGroup(element: ElementHandle, group: GroupHandle | null): void;

  getElementHistory<T>(element: ElementHandle, key: string): T | undefined;
  setElementHistory<T>(element: ElementHandle, data: T, key: string): void;
  getGroupDescendants(group: GroupHandle): ElementHandle[];

  booleanUnion(elements: ElementHandle[]): ElementHandle;
  booleanDifference(element: ElementHandle, tools: ElementHandle[]): ElementHandle;
  booleanIntersection(elements: ElementHandle[]): ElementHandle;

  getMaterial(name: string): MaterialHandle;
  createLayer(name: string): LayerHandle;
  getDefaultLayer(): LayerHandle;
}

export interface PythaUIHooks {
  alert(message: string): void;
  wait(milliseconds: number): Promise<void>;
  formatLength(value: number): string;
  parseLength(text: string): number | undefined;
  formatNumber(value: number): string;
  parseNumber(text: string): number | undefined;
  runModalDialog(
    initFunc: (dialog: DialogHandle, data: unknown) => void,
    data: unknown
  ): void;

  createDialog(): DialogHandle;
  setWindowTitle(dialog: DialogHandle, title: string): void;
  createLabel(dialog: DialogHandle, position: number | Vector2, text: string): ControlHandle;
  createTextBox(dialog: DialogHandle, position: number | Vector2, value: string): ControlHandle;
  createButton(dialog: DialogHandle, position: number | Vector2, label: string): ControlHandle;
  createCheckBox(dialog: DialogHandle, position: number | Vector2, label: string): ControlHandle;
  createComboBox(dialog: DialogHandle, position: number | Vector2, items: string[]): ControlHandle;
  createListBox(dialog: DialogHandle, position: number | Vector2, items: string[]): ControlHandle;
  createOkButton(dialog: DialogHandle, position: number | Vector2): ControlHandle;
  createCancelButton(dialog: DialogHandle, position: number | Vector2): ControlHandle;
  setOnChangeHandler(control: ControlHandle, handler: (value: unknown) => void): void;
  setOnClickHandler(control: ControlHandle, handler: () => void): void;
  runModalSubdialog(parentDialog: DialogHandle, initFunc: (dialog: DialogHandle, data: unknown) => void, data: unknown): void;
  endModalCancel(dialog: DialogHandle): void;
  setControlText(control: ControlHandle, text: string): void;
  setControlChecked(control: ControlHandle, checked: boolean): void;
  clearControlItems(control: ControlHandle): void;
  equalizeColumnWidths(dialog: DialogHandle, columns: number[]): void;
  createAlign(dialog: DialogHandle, columns: number[]): void;
}

export interface PythaIOHooks {
  saveValues(key: string, data: unknown): void;
  loadValues<T>(key: string): T | undefined;
  parseJSON<T>(text: string): T | undefined;
  writeJSON(path: string, data: unknown): void;
  parseCSV(text: string): string[][];
  parseLines(text: string): string[];
}

export interface PythaUXHooks {
  selectMaterial(current?: MaterialHandle): Promise<MaterialHandle | undefined>;
  selectCoordinate(message?: string): Promise<Vector3 | undefined>;
  selectPart(message?: string): Promise<ElementHandle | undefined>;
  highlightElement(element: ElementHandle): void;
  clearHighlights(): void;
  setOnLeftClickHandler(handler: (position: Vector3) => void): void;
  setOnLeftDragMoveHandler(handler: (position: Vector3) => void): void;
}

export interface PythaGeoHooks {
  cleanPolygon2D(points: Vector2[]): Vector2[];
}

export interface PythaHooks {
  pytha: PythaRuntimeHooks;
  pyui: PythaUIHooks;
  pyio: PythaIOHooks;
  pyux: PythaUXHooks;
  pygeo: PythaGeoHooks;
}