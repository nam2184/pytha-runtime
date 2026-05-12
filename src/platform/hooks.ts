import type { PythaHooks } from '../types/element';
import type { HTMLUIPlatform } from '../ui/html-dialog';
import type { ThreePlatform } from '../platform/three-platform';

export function createPythaHooks(
  three: ThreePlatform,
  ui: HTMLUIPlatform
): PythaHooks {
  return {
    pytha: {
      createBlock: (length, width, height, origin, options) =>
        three.createBlock(length, width, height, origin, options),
      createCylinder: (height, radius, origin, options) =>
        three.createCylinder(height, radius, origin, options),
      createSphere: (radius, origin, options) =>
        three.createSphere(radius, origin, options),
      createPolygon: (points) =>
        three.createPolygon(points),
      createPolyline: (closed, points) =>
        three.createPolyline(closed, points),
      createProfile: (contour, height) =>
        three.createProfile(contour, height),
      createGroup: (elements, options) =>
        three.createGroup(elements, options),

      deleteElement: (element) =>
        three.deleteElement(element),
      copyElement: (element, offset) =>
        three.copyElement(element, offset),
      moveElement: (element, offset) =>
        three.moveElement(element, offset),
      rotateElement: (element, origin, axis, angle) =>
        three.rotateElement(element, origin, axis, angle),
      mirrorElement: (element, origin, axis) =>
        three.mirrorElement(element, origin, axis),

      setElementName: (element, name) =>
        three.setElementName(element, name),
      setElementPen: (element, penIndex) =>
        three.setElementPen(element, penIndex),
      setElementMaterial: (element, material) =>
        three.setElementMaterial(element, material),
      setElementLayer: (element, layer) =>
        three.setElementLayer(element, layer),
      setElementGroup: (element, group) =>
        three.setElementGroup(element, group),

      getElementHistory: (element, key) =>
        three.getElementHistory(element, key),
      setElementHistory: (element, data, key) =>
        three.setElementHistory(element, data, key),
      getGroupDescendants: (group) =>
        three.getGroupDescendants(group),

      booleanUnion: (elements) =>
        three.booleanUnion(elements),
      booleanDifference: (element, tools) =>
        three.booleanDifference(element, tools),
      booleanIntersection: (elements) =>
        three.booleanIntersection(elements),

      getMaterial: (name) => three.getMaterial(name),
      createLayer: (name) => three.createLayer(name),
      getDefaultLayer: () => three.getDefaultLayer(),
    },

    pyui: {
      alert: (message) => ui.alert(message),
      wait: (milliseconds) => ui.wait(milliseconds),
      formatLength: (value) => ui.formatLength(value),
      parseLength: (text) => ui.parseLength(text),
      formatNumber: (value) => ui.formatNumber(value),
      parseNumber: (text) => ui.parseNumber(text),
      runModalDialog: (initFunc, data) => ui.runModalDialog(initFunc, data),
      createDialog: () => ui.createDialog(),
      setWindowTitle: (dialog, title) => ui.setWindowTitle(dialog, title),
      createLabel: (dialog, position, text) => ui.createLabel(dialog, position, text),
      createTextBox: (dialog, position, value) => ui.createTextBox(dialog, position, value),
      createButton: (dialog, position, label) => ui.createButton(dialog, position, label),
      createCheckBox: (dialog, position, label) => ui.createCheckBox(dialog, position, label),
      createComboBox: (dialog, position, items) => ui.createComboBox(dialog, position, items),
      createListBox: (dialog, position, items) => ui.createListBox(dialog, position, items),
      createOkButton: (dialog, position) => ui.createOkButton(dialog, position),
      createCancelButton: (dialog, position) => ui.createCancelButton(dialog, position),
      setOnChangeHandler: (control, handler) => ui.setOnChangeHandler(control, handler),
      setOnClickHandler: (control, handler) => ui.setOnClickHandler(control, handler),
      runModalSubdialog: (parentDialog, initFunc, data) =>
        ui.runModalSubdialog(parentDialog, initFunc, data),
      endModalCancel: (dialog) => ui.endModalCancel(dialog),
      setControlText: (control, text) => ui.setControlText(control, text),
      setControlChecked: (control, checked) => ui.setControlChecked(control, checked),
      clearControlItems: (control) => ui.clearControlItems(control),
      equalizeColumnWidths: (dialog, columns) => ui.equalizeColumnWidths(dialog, columns),
      createAlign: (dialog, columns) => ui.createAlign(dialog, columns),
    },

    pyio: {
      saveValues: (key, data) => {
        localStorage.setItem(`pytha_${key}`, JSON.stringify(data));
      },
      loadValues: (key) => {
        const stored = localStorage.getItem(`pytha_${key}`);
        if (stored) {
          try {
            return JSON.parse(stored);
          } catch {
            return undefined;
          }
        }
        return undefined;
      },
      parseJSON: (text) => {
        try {
          return JSON.parse(text);
        } catch {
          return undefined;
        }
      },
      writeJSON: (path, data) => {
        console.log('[PYIO] writeJSON not fully supported in browser', path, data);
      },
      parseCSV: (text) => {
        return text.split('\n').map(line => line.split(','));
      },
      parseLines: (text) => {
        return text.split('\n');
      },
    },

    pyux: {
      selectMaterial: async (current) => {
        console.log('[PYUX] selectMaterial - using default');
        return undefined;
      },
      selectCoordinate: async (message) => {
        console.log('[PYUX] selectCoordinate - using default');
        return undefined;
      },
      selectPart: async (message) => {
        console.log('[PYUX] selectPart - using default');
        return undefined;
      },
      highlightElement: (element) => {
        console.log('[PYUX] highlightElement', element.id);
      },
      clearHighlights: () => {
        console.log('[PYUX] clearHighlights');
      },
      setOnLeftClickHandler: (handler) => {
        console.log('[PYUX] setOnLeftClickHandler');
      },
      setOnLeftDragMoveHandler: (handler) => {
        console.log('[PYUX] setOnLeftDragMoveHandler');
      },
    },

    pygeo: {
      cleanPolygon2D: (points) => {
        return points;
      },
    },
  };
}