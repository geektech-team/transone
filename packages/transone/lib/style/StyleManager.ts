export interface StyleOptions {
  selector: string;
  properties: Record<string, string | number>;
  hover?: Record<string, string | number>;
  media?: Record<string, Record<string, string | number>>;
}

export class StyleManager {
  public styleElement: HTMLStyleElement | null = null;
  public styles: Map<string, StyleOptions> = new Map();

  constructor() {
    // style 元素延迟到首次 addStyle 时创建，避免无样式组件产生空 <style> 节点
  }

  public addStyle(name: string, options: StyleOptions): void {
    this.styles.set(name, options);
    this.updateStyles();
  }

  public removeStyle(name: string): void {
    this.styles.delete(name);
    this.updateStyles();
  }

  public clearStyles(): void {
    this.styles.clear();
    if (this.styleElement) {
      this.styleElement.textContent = '';
    }
  }

  public destroy(): void {
    this.clearStyles();
    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = null;
    }
  }

  private ensureStyleElement(): HTMLStyleElement {
    if (!this.styleElement) {
      const element = document.createElement('style');
      document.head.appendChild(element);
      this.styleElement = element;
    }
    return this.styleElement;
  }

  private convertToCSS(properties: Record<string, string | number>): string {
    return Object.entries(properties)
      .map(([key, value]) => {
        const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        return `${cssKey}: ${value};`;
      })
      .join('\n');
  }

  private updateStyles(): void {
    if (this.styles.size === 0) {
      if (this.styleElement) {
        this.styleElement.textContent = '';
      }
      return;
    }

    const element = this.ensureStyleElement();
    let cssText = '';

    this.styles.forEach((style) => {
      // 基础样式
      cssText += `${style.selector} {\n${this.convertToCSS(style.properties)}\n}\n`;

      // hover 样式
      if (style.hover) {
        cssText += `${style.selector}:hover {\n${this.convertToCSS(style.hover)}\n}\n`;
      }

      // media 查询
      if (style.media) {
        Object.entries(style.media).forEach(([query, properties]) => {
          cssText += `@media ${query} {\n${style.selector} {\n${this.convertToCSS(properties)}\n}\n}\n`;
        });
      }
    });

    element.textContent = cssText;
  }
}
