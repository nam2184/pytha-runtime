import { lua, lauxlib, lualib, to_luastring, to_jsstring, lua_State } from 'fengari';
import { tojs, push, luaopen_js } from 'fengari-interop';
import type { PythaHooks, ElementHandle, Vector3 } from '../types/element';

export interface FengariRuntimeCallbacks {
  onLog?: (message: string) => void;
  onError?: (error: Error) => void;
  onDialogCreate?: (dialog: unknown) => void;
}

export class FengariRuntime {
  private L: lua_State;
  private hooks: PythaHooks;
  private callbacks: FengariRuntimeCallbacks;
  private dialogResolver: ((value: unknown) => void) | null = null;

  constructor(hooks: PythaHooks, callbacks: FengariRuntimeCallbacks = {}) {
    this.hooks = hooks;
    this.callbacks = callbacks;

    this.L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(this.L);

    lauxlib.luaL_requiref(this.L, to_luastring('js'), luaopen_js, 1);
    lua.lua_pop(this.L, 1);

    this.exposePythaAPI();
    this.exposeMathExtensions();
  }

  private pushJsFunction(fn: (L: lua_State) => number | void): void {
    lua.lua_pushjsclosure(this.L, fn, 0);
  }

  private exposePythaAPI(): void {
    const L = this.L;

    lua.lua_createtable(L, 0, 50);
    const tableIdx = lua.lua_gettop(L);

    const setters: [string, () => void][] = [
      ['create_block', () => this.wrapCreateBlock()],
      ['create_cylinder', () => this.wrapCreateCylinder()],
      ['create_sphere', () => this.wrapCreateSphere()],
      ['create_polygon', () => this.wrapCreatePolygon()],
      ['create_polyline', () => this.wrapCreatePolyline()],
      ['create_profile', () => this.wrapCreateProfile()],
      ['create_group', () => this.wrapCreateGroup()],
      ['delete_element', () => this.wrapDeleteElement()],
      ['copy_element', () => this.wrapCopyElement()],
      ['move_element', () => this.wrapMoveElement()],
      ['rotate_element', () => this.wrapRotateElement()],
      ['mirror_element', () => this.wrapMirrorElement()],
      ['set_element_name', () => this.wrapSetElementName()],
      ['set_element_pen', () => this.wrapSetElementPen()],
      ['set_element_material', () => this.wrapSetElementMaterial()],
      ['set_element_layer', () => this.wrapSetElementLayer()],
      ['set_element_group', () => this.wrapSetElementGroup()],
      ['set_element_history', () => this.wrapSetElementHistory()],
      ['get_element_history', () => this.wrapGetElementHistory()],
      ['get_group_descendants', () => this.wrapGetGroupDescendants()],
      ['boole_part_union', () => this.wrapBooleanUnion()],
      ['get_length_unit', () => this.wrapGetLengthUnit()],
    ];

    for (const [name, setter] of setters) {
      lua.lua_pushstring(L, to_luastring(name));
      setter();
      lua.lua_settable(L, tableIdx);
    }

    lua.lua_setglobal(L, to_luastring('pytha'));

    this.createPyuiTable();
    this.createPyioTable();
    this.createPyuxTable();
    this.createPygeoTable();

    lua.lua_pushstring(L, to_luastring('pyloc'));
    this.pushJsFunction((_L: lua_State) => {
      const s = to_jsstring(lua.lua_tostring(_L, 1)!);
      lua.lua_pushstring(_L, to_luastring(s));
      return 1;
    });
    lua.lua_settable(L, lua.LUA_GLOBALSINDEX);

    lua.lua_pop(L, 1);
  }

  private wrapCreateBlock(): void {
    const hooks = this.hooks;
    this.pushJsFunction((L: lua_State) => {
      const length = lua.lua_tonumber(L, 1);
      const width = lua.lua_tonumber(L, 2);
      const height = lua.lua_tonumber(L, 3);
      let origin: Vector3 | undefined;
      let options: Record<string, unknown> = {};

      if (lua.lua_gettop(L) >= 4 && lua.lua_istable(L, 4)) {
        origin = tojs(L, 4) as Vector3;
      }
      if (lua.lua_gettop(L) >= 5 && lua.lua_istable(L, 5)) {
        options = tojs(L, 5) as Record<string, unknown>;
      }

      const result = hooks.pytha.createBlock(length, width, height, origin, options as any);
      push(L, result);
      return 1;
    });
  }

  private wrapCreateCylinder(): void {
    const hooks = this.hooks;
    this.pushJsFunction((L: lua_State) => {
      const height = lua.lua_tonumber(L, 1);
      const radius = lua.lua_tonumber(L, 2);
      let origin: Vector3 | undefined;
      let options: Record<string, unknown> = {};

      if (lua.lua_gettop(L) >= 3 && lua.lua_istable(L, 3)) {
        origin = tojs(L, 3) as Vector3;
      }
      if (lua.lua_gettop(L) >= 4 && lua.lua_istable(L, 4)) {
        options = tojs(L, 4) as Record<string, unknown>;
      }

      const result = hooks.pytha.createCylinder(height, radius, origin, options as any);
      push(L, result);
      return 1;
    });
  }

  private wrapCreateSphere(): void {
    const hooks = this.hooks;
    this.pushJsFunction((L: lua_State) => {
      const radius = lua.lua_tonumber(L, 1);
      const origin = lua.lua_gettop(L) >= 2 && lua.lua_istable(L, 2)
        ? tojs(L, 2) as Vector3
        : undefined;
      const options = lua.lua_gettop(L) >= 3 && lua.lua_istable(L, 3)
        ? tojs(L, 3) as Record<string, unknown>
        : undefined;

      const result = hooks.pytha.createSphere(radius, origin, options as any);
      push(L, result);
      return 1;
    });
  }

  private wrapCreatePolygon(): void {
    const hooks = this.hooks;
    this.pushJsFunction((L: lua_State) => {
      const points = tojs(L, 1) as Vector3[];
      const result = hooks.pytha.createPolygon(points);
      push(L, result);
      return 1;
    });
  }

  private wrapCreatePolyline(): void {
    const hooks = this.hooks;
    this.pushJsFunction((L: lua_State) => {
      const closedStr = to_jsstring(lua.lua_tostring(L, 1)!);
      const points = tojs(L, 2) as Vector3[];
      const result = hooks.pytha.createPolyline(closedStr as 'closed' | 'open', points);
      push(L, result);
      return 1;
    });
  }

  private wrapCreateProfile(): void {
    const hooks = this.hooks;
    this.pushJsFunction((L: lua_State) => {
      const contour = tojs(L, 1);
      const height = lua.lua_tonumber(L, 2);
      const result = hooks.pytha.createProfile(contour as any, height);
      push(L, result);
      return 1;
    });
  }

  private wrapCreateGroup(): void {
    const hooks = this.hooks;
    this.pushJsFunction((L: lua_State) => {
      const elements = tojs(L, 1) as ElementHandle[];
      const options = lua.lua_gettop(L) >= 2 && lua.lua_istable(L, 2)
        ? tojs(L, 2) as { name?: string }
        : undefined;
      const result = hooks.pytha.createGroup(elements, options);
      push(L, result);
      return 1;
    });
  }

  private wrapDeleteElement(): void {
    const hooks = this.hooks;
    this.pushJsFunction((L: lua_State) => {
      const element = tojs(L, 1);
      hooks.pytha.deleteElement(element as any);
      return 0;
    });
  }

  private wrapCopyElement(): void {
    const hooks = this.hooks;
    this.pushJsFunction((L: lua_State) => {
      const element = tojs(L, 1);
      const offset = tojs(L, 2) as Vector3;
      const result = hooks.pytha.copyElement(element as any, offset);
      push(L, result);
      return 1;
    });
  }

  private wrapMoveElement(): void {
    const hooks = this.hooks;
    this.pushJsFunction((L: lua_State) => {
      const element = tojs(L, 1);
      const offset = tojs(L, 2) as Vector3;
      hooks.pytha.moveElement(element as any, offset);
      return 0;
    });
  }

  private wrapRotateElement(): void {
    const hooks = this.hooks;
    this.pushJsFunction((L: lua_State) => {
      const element = tojs(L, 1);
      const origin = tojs(L, 2) as Vector3;
      const axis = to_jsstring(lua.lua_tostring(L, 3)!);
      const angle = lua.lua_tonumber(L, 4);
      hooks.pytha.rotateElement(element as any, origin, axis as 'x' | 'y' | 'z', angle);
      return 0;
    });
  }

  private wrapMirrorElement(): void {
    const hooks = this.hooks;
    this.pushJsFunction((L: lua_State) => {
      const element = tojs(L, 1);
      const origin = tojs(L, 2) as Vector3;
      const axis = to_jsstring(lua.lua_tostring(L, 3)!);
      hooks.pytha.mirrorElement(element as any, origin, axis as 'x' | 'y' | 'z');
      return 0;
    });
  }

  private wrapSetElementName(): void {
    const hooks = this.hooks;
    this.pushJsFunction((L: lua_State) => {
      const element = tojs(L, 1);
      const name = to_jsstring(lua.lua_tostring(L, 2)!);
      hooks.pytha.setElementName(element as any, name);
      return 0;
    });
  }

  private wrapSetElementPen(): void {
    const hooks = this.hooks;
    this.pushJsFunction((L: lua_State) => {
      const element = tojs(L, 1);
      const penIndex = lua.lua_tointeger(L, 2);
      hooks.pytha.setElementPen(element as any, penIndex);
      return 0;
    });
  }

  private wrapSetElementMaterial(): void {
    const hooks = this.hooks;
    this.pushJsFunction((L: lua_State) => {
      const element = tojs(L, 1);
      const material = tojs(L, 2);
      hooks.pytha.setElementMaterial(element as any, material as any);
      return 0;
    });
  }

  private wrapSetElementLayer(): void {
    const hooks = this.hooks;
    this.pushJsFunction((L: lua_State) => {
      const element = tojs(L, 1);
      const layer = tojs(L, 2);
      hooks.pytha.setElementLayer(element as any, layer as any);
      return 0;
    });
  }

  private wrapSetElementGroup(): void {
    const hooks = this.hooks;
    this.pushJsFunction((L: lua_State) => {
      const element = tojs(L, 1);
      const group = lua.lua_isnoneornil(L, 2) ? null : tojs(L, 2);
      hooks.pytha.setElementGroup(element as any, group as any);
      return 0;
    });
  }

  private wrapSetElementHistory(): void {
    const hooks = this.hooks;
    this.pushJsFunction((L: lua_State) => {
      const element = tojs(L, 1);
      const data = tojs(L, 2);
      const key = to_jsstring(lua.lua_tostring(L, 3)!);
      hooks.pytha.setElementHistory(element as any, data, key);
      return 0;
    });
  }

  private wrapGetElementHistory(): void {
    const hooks = this.hooks;
    this.pushJsFunction((L: lua_State) => {
      const element = tojs(L, 1);
      const key = to_jsstring(lua.lua_tostring(L, 2)!);
      const result = hooks.pytha.getElementHistory(element as any, key);
      if (result !== undefined) {
        push(L, result);
      } else {
        lua.lua_pushnil(L);
      }
      return 1;
    });
  }

  private wrapGetGroupDescendants(): void {
    const hooks = this.hooks;
    this.pushJsFunction((L: lua_State) => {
      const group = tojs(L, 1);
      const result = hooks.pytha.getGroupDescendants(group as any);
      push(L, result);
      return 1;
    });
  }

  private wrapBooleanUnion(): void {
    const hooks = this.hooks;
    this.pushJsFunction((L: lua_State) => {
      const elements = tojs(L, 1) as ElementHandle[];
      const result = hooks.pytha.booleanUnion(elements);
      push(L, result);
      return 1;
    });
  }

  private wrapGetLengthUnit(): void {
    lua.lua_pushnumber(this.L, 1.0);
  }

  private createPyuiTable(): void {
    const L = this.L;
    const hooks = this.hooks;
    const self = this;

    lua.lua_createtable(L, 0, 40);
    const tableIdx = lua.lua_gettop(L);

    const setters: [string, () => void][] = [
      ['alert', () => {
        this.pushJsFunction((_L: lua_State) => {
          const msg = to_jsstring(lua.lua_tostring(_L, 1)!);
          hooks.pyui.alert(msg);
          return 0;
        });
      }],
      ['wait', () => {
        this.pushJsFunction((_L: lua_State) => {
          const ms = lua.lua_tonumber(_L, 1);
          hooks.pyui.wait(ms);
          return 0;
        });
      }],
      ['format_length', () => {
        this.pushJsFunction((_L: lua_State) => {
          const val = lua.lua_tonumber(_L, 1);
          const result = hooks.pyui.formatLength(val);
          lua.lua_pushstring(_L, to_luastring(result));
          return 1;
        });
      }],
      ['parse_length', () => {
        this.pushJsFunction((_L: lua_State) => {
          const text = to_jsstring(lua.lua_tostring(_L, 1)!);
          const result = hooks.pyui.parseLength(text);
          if (result !== undefined) {
            lua.lua_pushnumber(_L, result);
          } else {
            lua.lua_pushnil(_L);
          }
          return 1;
        });
      }],
      ['format_number', () => {
        this.pushJsFunction((_L: lua_State) => {
          const val = lua.lua_tonumber(_L, 1);
          const result = hooks.pyui.formatNumber(val);
          lua.lua_pushstring(_L, to_luastring(result));
          return 1;
        });
      }],
      ['parse_number', () => {
        this.pushJsFunction((_L: lua_State) => {
          const text = to_jsstring(lua.lua_tostring(_L, 1)!);
          const result = hooks.pyui.parseNumber(text);
          if (result !== undefined) {
            lua.lua_pushnumber(_L, result);
          } else {
            lua.lua_pushnil(_L);
          }
          return 1;
        });
      }],
      ['run_modal_dialog', () => {
        this.pushJsFunction((_L: lua_State) => {
          const initFunc = tojs(_L, 1);
          const data = lua.lua_gettop(_L) >= 2 ? tojs(_L, 2) : undefined;

          const dialog = hooks.pyui.createDialog();
          const wrappedDialog = self.createDialogProxy(dialog);

          try {
            (initFunc as (dialog: unknown, data: unknown) => void)(wrappedDialog, data);
          } catch (e) {
            self.callbacks.onError?.(e instanceof Error ? e : new Error(String(e)));
          }

          hooks.pyui.runModalDialog(() => {}, data);

          return 0;
        });
      }],
      ['end_modal_cancel', () => {
        this.pushJsFunction((_L: lua_State) => {
          if (self.dialogResolver) {
            self.dialogResolver(null);
            self.dialogResolver = null;
          }
          return 0;
        });
      }],
    ];

    for (const [name, setter] of setters) {
      lua.lua_pushstring(L, to_luastring(name));
      setter();
      lua.lua_settable(L, tableIdx);
    }

    lua.lua_setglobal(L, to_luastring('pyui'));
  }

  private createDialogProxy(dialog: ReturnType<typeof this.hooks.pyui.createDialog>) {
    const self = this;

    const wrapControl = (control: ReturnType<typeof this.hooks.pyui.createLabel>) => {
      return {
        set_on_change_handler: (handler: unknown) => {
          self.hooks.pyui.setOnChangeHandler(control as any, handler as any);
        },
        set_on_click_handler: (handler: unknown) => {
          self.hooks.pyui.setOnClickHandler(control as any, handler as any);
        },
      };
    };

    return {
      set_window_title: (title: string) => {
        self.hooks.pyui.setWindowTitle(dialog, title);
      },
      create_label: (position: unknown, text: string) => {
        const ctrl = self.hooks.pyui.createLabel(dialog, position as any, text);
        return wrapControl(ctrl);
      },
      create_text_box: (position: unknown, value: string) => {
        const ctrl = self.hooks.pyui.createTextBox(dialog, position as any, value);
        return wrapControl(ctrl);
      },
      create_button: (position: unknown, label: string) => {
        const ctrl = self.hooks.pyui.createButton(dialog, position as any, label);
        return wrapControl(ctrl);
      },
      create_check_box: (position: unknown, label: string) => {
        const ctrl = self.hooks.pyui.createCheckBox(dialog, position as any, label);
        return wrapControl(ctrl);
      },
      create_combo_box: (position: unknown, items: string[]) => {
        const ctrl = self.hooks.pyui.createComboBox(dialog, position as any, items);
        return wrapControl(ctrl);
      },
      create_list_box: (position: unknown, items: string[]) => {
        const ctrl = self.hooks.pyui.createListBox(dialog, position as any, items);
        return wrapControl(ctrl);
      },
      create_ok_button: (position: unknown) => {
        const ctrl = self.hooks.pyui.createOkButton(dialog, position as any);
        return wrapControl(ctrl);
      },
      create_cancel_button: (position: unknown) => {
        const ctrl = self.hooks.pyui.createCancelButton(dialog, position as any);
        return wrapControl(ctrl);
      },
      create_align: (columns: unknown[]) => {
        self.hooks.pyui.createAlign(dialog, columns as any);
      },
      equalize_column_widths: (columns: unknown[]) => {
        self.hooks.pyui.equalizeColumnWidths(dialog, columns as any);
      },
    };
  }

  private createPyioTable(): void {
    const L = this.L;
    const hooks = this.hooks;

    lua.lua_createtable(L, 0, 10);
    const tableIdx = lua.lua_gettop(L);

    const setters: [string, () => void][] = [
      ['save_values', () => {
        this.pushJsFunction((_L: lua_State) => {
          const key = to_jsstring(lua.lua_tostring(_L, 1)!);
          const data = tojs(_L, 2);
          hooks.pyio.saveValues(key, data);
          return 0;
        });
      }],
      ['load_values', () => {
        this.pushJsFunction((_L: lua_State) => {
          const key = to_jsstring(lua.lua_tostring(_L, 1)!);
          const result = hooks.pyio.loadValues(key);
          if (result !== undefined) {
            push(_L, result);
          } else {
            lua.lua_pushnil(_L);
          }
          return 1;
        });
      }],
      ['parse_json', () => {
        this.pushJsFunction((_L: lua_State) => {
          const text = to_jsstring(lua.lua_tostring(_L, 1)!);
          const result = hooks.pyio.parseJSON(text);
          if (result !== undefined) {
            push(_L, result);
          } else {
            lua.lua_pushnil(_L);
          }
          return 1;
        });
      }],
      ['parse_csv', () => {
        this.pushJsFunction((_L: lua_State) => {
          const text = to_jsstring(lua.lua_tostring(_L, 1)!);
          const result = hooks.pyio.parseCSV(text);
          push(_L, result);
          return 1;
        });
      }],
      ['parse_lines', () => {
        this.pushJsFunction((_L: lua_State) => {
          const text = to_jsstring(lua.lua_tostring(_L, 1)!);
          const result = hooks.pyio.parseLines(text);
          push(_L, result);
          return 1;
        });
      }],
    ];

    for (const [name, setter] of setters) {
      lua.lua_pushstring(L, to_luastring(name));
      setter();
      lua.lua_settable(L, tableIdx);
    }

    lua.lua_setglobal(L, to_luastring('pyio'));
  }

  private createPyuxTable(): void {
    const L = this.L;
    const hooks = this.hooks;

    lua.lua_createtable(L, 0, 10);
    const tableIdx = lua.lua_gettop(L);

    lua.lua_pushstring(L, to_luastring('select_material'));
    this.pushJsFunction((_L: lua_State) => {
      const current = lua.lua_gettop(_L) >= 1 && !lua.lua_isnoneornil(_L, 1)
        ? tojs(_L, 1)
        : undefined;
      hooks.pyux.selectMaterial(current as any).then((result: any) => {
        if (result !== undefined) {
          push(_L, result);
        } else {
          lua.lua_pushnil(_L);
        }
      });
      return 1;
    });
    lua.lua_settable(L, tableIdx);

    lua.lua_pushstring(L, to_luastring('select_coordinate'));
    this.pushJsFunction((_L: lua_State) => {
      const message = lua.lua_gettop(_L) >= 1 && !lua.lua_isnoneornil(_L, 1)
        ? to_jsstring(lua.lua_tostring(_L, 1)!)
        : undefined;
      hooks.pyux.selectCoordinate(message).then((result: any) => {
        if (result !== undefined) {
          push(_L, result);
        } else {
          lua.lua_pushnil(_L);
        }
      });
      return 1;
    });
    lua.lua_settable(L, tableIdx);

    lua.lua_pushstring(L, to_luastring('select_part'));
    this.pushJsFunction((_L: lua_State) => {
      const message = lua.lua_gettop(_L) >= 1 && !lua.lua_isnoneornil(_L, 1)
        ? to_jsstring(lua.lua_tostring(_L, 1)!)
        : undefined;
      hooks.pyux.selectPart(message).then((result: any) => {
        if (result !== undefined) {
          push(_L, result);
        } else {
          lua.lua_pushnil(_L);
        }
      });
      return 1;
    });
    lua.lua_settable(L, tableIdx);

    lua.lua_pushstring(L, to_luastring('highlight_element'));
    this.pushJsFunction((_L: lua_State) => {
      const element = tojs(_L, 1);
      hooks.pyux.highlightElement(element as any);
      return 0;
    });
    lua.lua_settable(L, tableIdx);

    lua.lua_pushstring(L, to_luastring('clear_highlights'));
    this.pushJsFunction((_L: lua_State) => {
      hooks.pyux.clearHighlights();
      return 0;
    });
    lua.lua_settable(L, tableIdx);

    lua.lua_setglobal(L, to_luastring('pyux'));
  }

  private createPygeoTable(): void {
    const L = this.L;
    const hooks = this.hooks;

    lua.lua_createtable(L, 0, 5);
    const tableIdx = lua.lua_gettop(L);

    lua.lua_pushstring(L, to_luastring('clean_polygon_2d'));
    this.pushJsFunction((_L: lua_State) => {
      const points = tojs(_L, 1);
      const result = hooks.pygeo.cleanPolygon2D(points as any);
      push(_L, result);
      return 1;
    });
    lua.lua_settable(L, tableIdx);

    lua.lua_setglobal(L, to_luastring('pygeo'));
  }

  private exposeMathExtensions(): void {
    const L = this.L;

    lua.lua_getglobal(L, to_luastring('math'));

    const extensions: [string, (n: number) => number][] = [
      ['SIN', n => Math.sin(n * Math.PI / 180)],
      ['COS', n => Math.cos(n * Math.PI / 180)],
      ['TAN', n => Math.tan(n * Math.PI / 180)],
      ['ATAN', n => Math.atan(n) * 180 / Math.PI],
      ['ASIN', n => Math.asin(n) * 180 / Math.PI],
      ['ACOS', n => Math.acos(n) * 180 / Math.PI],
      ['SQRT', n => Math.sqrt(n)],
      ['ABS', n => Math.abs(n)],
      ['FLOOR', n => Math.floor(n)],
      ['CEIL', n => Math.ceil(n)],
      ['ROUND', n => Math.round(n)],
      ['LOG', n => Math.log(n)],
      ['LOG10', n => Math.log10(n)],
      ['EXP', n => Math.exp(n)],
      ['RAD', n => n * Math.PI / 180],
      ['DEG', n => n * 180 / Math.PI],
      ['PI', () => Math.PI],
    ];

    for (const [name, fn] of extensions) {
      lua.lua_pushstring(L, to_luastring(name));
      if (name === 'PI') {
        lua.lua_pushnumber(L, fn(0));
      } else {
        this.pushJsFunction((_L: lua_State) => {
          const n = lua.lua_tonumber(_L, 1) ?? 0;
          lua.lua_pushnumber(_L, fn(n));
          return 1;
        });
      }
      lua.lua_settable(L, -3);
    }

    lua.lua_pushstring(L, to_luastring('ATAN2'));
    this.pushJsFunction((_L: lua_State) => {
      const y = lua.lua_tonumber(_L, 1) ?? 0;
      const x = lua.lua_tonumber(_L, 2) ?? 0;
      lua.lua_pushnumber(_L, Math.atan2(y, x) * 180 / Math.PI);
      return 1;
    });
    lua.lua_settable(L, -3);

    lua.lua_pushstring(L, to_luastring('POW'));
    this.pushJsFunction((_L: lua_State) => {
      const n = lua.lua_tonumber(_L, 1) ?? 0;
      const p = lua.lua_tonumber(_L, 2) ?? 0;
      lua.lua_pushnumber(_L, Math.pow(n, p));
      return 1;
    });
    lua.lua_settable(L, -3);

    lua.lua_pop(L, 1);
  }

  async executeAsync(code: string): Promise<void> {
    const L = this.L;
    const result = lauxlib.luaL_dostring(L, to_luastring(code));

    if (result !== lua.LUA_OK) {
      const error = to_jsstring(lauxlib.luaL_tolstring(L, -1)!);
      lua.lua_pop(L, 1);
      const err = new Error(`Lua error: ${error}`);
      this.callbacks.onError?.(err);
      throw err;
    }
  }

  async executeMain(code: string): Promise<void> {
    const wrappedCode = `
      ${code}

      if main and type(main) == "function" then
        local ok, err = coroutine.resume(coroutine.create(main))
        if not ok then
          error(tostring(err))
        end
      end
    `;

    await this.executeAsync(wrappedCode);
  }

  dispose(): void {
    lua.lua_close(this.L);
  }
}