import { ThreeRenderer } from './renderer/three-renderer';
import { ThreePlatform, ElementRegistry } from './platform/three-platform';
import { HTMLUIPlatform } from './ui/html-dialog';
import { createPythaHooks } from './platform/hooks';
import { FengariRuntime } from './runtime/fengari-runtime';

export interface PythaRuntimeConfig {
  container: HTMLElement;
  onLog?: (message: string) => void;
  onError?: (error: Error) => void;
  onDialogCreate?: (dialog: unknown) => void;
}

export class PythaRuntimeClient {
  private renderer: ThreeRenderer;
  private threePlatform: ThreePlatform;
  private uiPlatform: HTMLUIPlatform;
  private hooks: ReturnType<typeof createPythaHooks>;
  private runtime: FengariRuntime;

  constructor(config: PythaRuntimeConfig) {
    this.renderer = new ThreeRenderer(config.container);

    this.threePlatform = new ThreePlatform({
      scene: this.renderer.getScene(),
      defaultLayer: this.renderer.getDefaultLayer(),
    });

    this.uiPlatform = new HTMLUIPlatform();

    this.hooks = createPythaHooks(this.threePlatform, this.uiPlatform);

    this.runtime = new FengariRuntime(this.hooks, {
      onLog: config.onLog ?? console.log,
      onError: config.onError ?? console.error,
      onDialogCreate: config.onDialogCreate,
    });
  }

  async executeLua(code: string): Promise<void> {
    try {
      await this.runtime.executeAsync(code);
    } catch (error) {
      console.error('Error executing Lua:', error);
      throw error;
    }
  }

  getRuntime(): FengariRuntime {
    return this.runtime;
  }

  getThreePlatform(): ThreePlatform {
    return this.threePlatform;
  }

  getElementRegistry(): ElementRegistry {
    return this.threePlatform.getRegistry();
  }

  dispose(): void {
    this.renderer.dispose();
    this.runtime.dispose();
  }
}

export { FengariRuntime } from './runtime/fengari-runtime';
export { ThreeRenderer } from './renderer/three-renderer';
export { ThreePlatform } from './platform/three-platform';
export { ElementRegistry } from './platform/three-platform';
export * from './types/element';