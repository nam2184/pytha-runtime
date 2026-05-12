import luaparse from 'luaparse';
import type { Chunk, Statement, FunctionDeclaration, LocalStatement, AssignmentStatement, CallExpression, IfStatement, WhileStatement, ForStatement, RepeatStatement, Expression, Identifier, MemberExpression, BooleanLiteral, NumericLiteral, StringLiteral, TableConstructorExpression, FunctionExpression, BinaryExpression, UnaryExpression } from 'luaparse';
import {
  createNode,
  createSequenceNode,
  createDialogNode,
  createCallbackNode,
  createOperationNode,
  createLoopNode,
  type ExecutionNode,
} from './execution-tree';

interface CallbackInfo {
  eventType: 'change' | 'click' | 'left_click' | 'right_click' | 'dragmove' | 'dragstart' | 'dragend';
  controlExpr: string;
  handler: ExecutionNode;
}

export class LuaASTParser {
  private currentFuncName: string | null = null;
  private callbacks: CallbackInfo[] = [];

  parse(chunk: Chunk): ExecutionNode {
    return this.visitChunk(chunk);
  }

  private visitChunk(chunk: Chunk): ExecutionNode {
    const children: ExecutionNode[] = [];
    for (const stmt of chunk.body) {
      const node = this.visitStatement(stmt);
      if (node) {
        if (Array.isArray(node)) {
          children.push(...node);
        } else {
          children.push(node);
        }
      }
    }

    return createSequenceNode(children);
  }

  private visitStatement(stmt: Statement): ExecutionNode | ExecutionNode[] | null {
    switch (stmt.type) {
      case 'FunctionDeclaration':
        return this.visitFunctionDeclaration(stmt as FunctionDeclaration);
      case 'LocalStatement':
        return this.visitLocalStatement(stmt as LocalStatement);
      case 'AssignmentStatement':
        return this.visitAssignmentStatement(stmt as AssignmentStatement);
      case 'CallExpression':
        return this.visitCallExpression(stmt as CallExpression);
      case 'IfStatement':
        return this.visitIfStatement(stmt as IfStatement);
      case 'WhileStatement':
        return this.visitWhileStatement(stmt as WhileStatement);
      case 'ForStatement':
        return this.visitForStatement(stmt as ForStatement);
      case 'RepeatStatement':
        return this.visitRepeatStatement(stmt as RepeatStatement);
      case 'ReturnStatement':
        return null;
      case 'BreakStatement':
        return null;
      default:
        return createOperationNode(`unknown_${stmt.type}`, [stmt]);
    }
  }

  private visitFunctionDeclaration(stmt: FunctionDeclaration): ExecutionNode {
    const name = stmt.identifier?.name ?? 'anonymous';
    const previousFuncName = this.currentFuncName;
    this.currentFuncName = name;
    this.callbacks = [];

    const body = this.visitBlock(stmt.body.body as Statement[]);

    this.currentFuncName = previousFuncName;

    if (name === 'main') {
      return createSequenceNode([
        createOperationNode('function_start', [{ name, callbacksRegistered: this.callbacks.length }]),
        ...body.children,
      ]);
    }

    return createSequenceNode([
      createOperationNode(`define_function_${name}`, []),
      ...body.children,
    ]);
  }

  private visitBlock(body: Statement[]): ExecutionNode {
    const children: ExecutionNode[] = [];
    for (const stmt of body) {
      const node = this.visitStatement(stmt);
      if (node) {
        if (Array.isArray(node)) {
          children.push(...node);
        } else {
          children.push(node);
        }
      }
    }
    return createSequenceNode(children);
  }

  private visitLocalStatement(stmt: LocalStatement): ExecutionNode | null {
    if (stmt.init.length === 1 && stmt.init[0]?.type === 'CallExpression') {
      return this.visitCallExpression(stmt.init[0] as CallExpression);
    }
    return createOperationNode('local_var', [
      stmt.variables.map((v) => (v as Identifier).name),
    ]);
  }

  private visitAssignmentStatement(stmt: AssignmentStatement): ExecutionNode | null {
    if (stmt.init.length === 1 && stmt.init[0]?.type === 'CallExpression') {
      return this.visitCallExpression(stmt.init[0] as CallExpression);
    }
    return null;
  }

  private visitCallExpression(stmt: CallExpression): ExecutionNode {
    const callee = this.getCalleeName(stmt.callee);

    if (callee === 'pyui.run_modal_dialog') {
      return this.buildDialogNode(stmt);
    }

    if (this.isCallbackSetter(callee)) {
      return this.buildCallbackNode(stmt, callee);
    }

    return createOperationNode(callee, stmt.arguments.map((a) => this.evaluateExpression(a)));
  }

  private buildDialogNode(stmt: CallExpression): ExecutionNode {
    const args = stmt.arguments;
    if (args.length < 1) {
      return createOperationNode('pyui.run_modal_dialog', ['missing_args']);
    }

    const dialogFuncName = this.extractFunctionName(args[0]);

    const dataArg = args.length > 1 ? this.evaluateExpression(args[1]) : null;

    return createDialogNode(
      dialogFuncName ?? 'anonymous_dialog',
      dataArg,
      null
    );
  }

  private buildCallbackNode(stmt: CallExpression, callee: string): ExecutionNode {
    const args = stmt.arguments;
    if (args.length < 1 || args[0].type !== 'FunctionExpression') {
      return createOperationNode('callback_setup', [callee]);
    }

    const handlerAST = args[0] as FunctionExpression;
    const eventType = this.extractEventType(callee);

    const objectName = this.getMemberObject(stmt.callee as MemberExpression);

    return createCallbackNode(
      eventType as CallbackInfo['eventType'],
      objectName ?? 'unknown',
      this.visitFunctionExpression(handlerAST)
    );
  }

  private visitFunctionExpression(func: FunctionExpression): ExecutionNode {
    return this.visitBlock((func.body as unknown) as Statement[]);
  }

  private visitIfStatement(stmt: IfStatement): ExecutionNode {
    const consequent = this.visitBlock(stmt.clauses[0].body as Statement[]);
    return createSequenceNode([
      createOperationNode('if', [this.evaluateExpression(stmt.clauses[0].condition)]),
      consequent,
    ]);
  }

  private visitWhileStatement(stmt: WhileStatement): ExecutionNode {
    const body = this.visitBlock((stmt.body as unknown) as Statement[]);
    return createLoopNode(
      '__while__',
      [{ condition: this.evaluateExpression(stmt.condition) }],
      body
    );
  }

  private visitForStatement(stmt: ForStatement): ExecutionNode {
    const variable = (stmt.variable as Identifier).name;
    let iterable: unknown[] = [];

    if (stmt.type === 'ForNumericStatement') {
      iterable = [
        {
          start: this.evaluateExpression(stmt.init as Expression),
          end: this.evaluateExpression(stmt.limit as Expression),
          step: stmt.step ? this.evaluateExpression(stmt.step) : 1,
        },
      ];
    } else if (stmt.type === 'ForGenericStatement') {
      const iterators = (stmt.iterators as Expression[]).map((i) => this.evaluateExpression(i));
      iterable = iterators as unknown[];
    }

    const body = this.visitBlock((stmt.body as unknown) as Statement[]);

    return createLoopNode(variable, iterable, body);
  }

  private visitRepeatStatement(stmt: RepeatStatement): ExecutionNode {
    const body = this.visitBlock((stmt.body as unknown) as Statement[]);
    return createLoopNode('__repeat__', [{}], body);
  }

  private getCalleeName(callee: Expression): string {
    switch (callee.type) {
      case 'Identifier':
        return (callee as Identifier).name;
      case 'MemberExpression':
        const obj = this.getMemberObject(callee as MemberExpression);
        const prop = this.getMemberProperty(callee as MemberExpression);
        return `${obj}.${prop}`;
      case 'IndexExpression':
        return 'index_access';
      default:
        return 'unknown';
    }
  }

  private getMemberObject(node: MemberExpression): string | null {
    if (node.object.type === 'Identifier') {
      return (node.object as Identifier).name;
    }
    if (node.object.type === 'MemberExpression') {
      return this.getMemberObject(node.object as MemberExpression);
    }
    return null;
  }

  private getMemberProperty(node: MemberExpression): string | null {
    if (node.property.type === 'Identifier') {
      return (node.property as Identifier).name;
    }
    return null;
  }

  private isCallbackSetter(name: string): boolean {
    return name.endsWith('set_on_change_handler') ||
           name.endsWith('set_on_click_handler') ||
           name.endsWith('set_on_left_click_handler') ||
           name.endsWith('set_on_right_click_handler') ||
           name.endsWith('set_on_left_dragstart_handler') ||
           name.endsWith('set_on_left_dragmove_handler') ||
           name.endsWith('set_on_left_dragend_handler');
  }

  private extractEventType(name: string): string {
    if (name.includes('change')) return 'change';
    if (name.includes('click') && name.includes('left')) return 'left_click';
    if (name.includes('click') && name.includes('right')) return 'right_click';
    if (name.includes('click')) return 'click';
    if (name.includes('dragstart')) return 'dragstart';
    if (name.includes('dragmove')) return 'dragmove';
    if (name.includes('dragend')) return 'dragend';
    return 'click';
  }

  private extractFunctionName(node: Expression): string | null {
    if (node.type === 'Identifier') {
      return (node as Identifier).name;
    }
    if (node.type === 'MemberExpression') {
      const obj = this.getMemberObject(node as MemberExpression);
      const prop = this.getMemberProperty(node as MemberExpression);
      return prop;
    }
    return null;
  }

  private evaluateExpression(node: Expression | undefined): unknown {
    if (!node) return 'nil';
    switch (node.type) {
      case 'NilLiteral':
        return null;
      case 'BooleanLiteral':
        return (node as BooleanLiteral).value;
      case 'NumericLiteral':
        return (node as NumericLiteral).value;
      case 'StringLiteral':
        return (node as StringLiteral).value;
      case 'TableConstructorExpression':
        return this.evaluateTable(node as TableConstructorExpression);
      case 'Identifier':
        return (node as Identifier).name;
      case 'MemberExpression': {
        const obj = this.getMemberObject(node as MemberExpression);
        const prop = this.getMemberProperty(node as MemberExpression);
        if (obj && prop) {
          return `${obj}.${prop}`;
        }
        return 'member_expr';
      }
      case 'BinaryExpression':
        return {
          op: (node as BinaryExpression).operator,
          left: this.evaluateExpression((node as BinaryExpression).left),
          right: this.evaluateExpression((node as BinaryExpression).right),
        };
      case 'UnaryExpression':
        return {
          op: (node as UnaryExpression).operator,
          argument: this.evaluateExpression((node as UnaryExpression).argument),
        };
      case 'CallExpression':
        return this.evaluateCallExpression(node as CallExpression);
      default:
        return `__expr_${node.type}__`;
    }
  }

  private evaluateTable(node: TableConstructorExpression): unknown[] {
    const result: unknown[] = [];
    for (const field of node.fields) {
      if (field.type === 'TableKey') {
        const k = field as unknown as { key: Expression; value: Expression };
        const key = this.evaluateExpression(k.key);
        result.push({ [key as string]: this.evaluateExpression(k.value) });
      } else if (field.type === 'TableValue') {
        const v = field as unknown as { value: Expression };
        result.push(this.evaluateExpression(v.value));
      }
    }
    return result;
  }

  private evaluateCallExpression(node: CallExpression): unknown {
    const callee = this.getCalleeName(node.callee);
    return `${callee}(${node.arguments.map((a) => this.evaluateExpression(a)).join(', ')})`;
  }
}

export function parseLuaToExecutionTree(code: string): ExecutionNode {
  const ast = luaparse.parse(code, {
    luaVersion: '5.3',
    comments: false,
    locations: false,
    scope: false,
  });

  const parser = new LuaASTParser();
  return parser.parse(ast as unknown as Chunk);
}
