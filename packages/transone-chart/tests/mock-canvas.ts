/**
 * 测试用 MockCanvas：实现 ICanvas2D 并记录全部调用命令，
 * 供图表几何正确性断言使用。measureText 为确定性宽度（字符数 × 6）。
 */

import type {
  CanvasLineCap,
  CanvasLineJoin,
  CanvasTextAlign,
  CanvasTextBaseline,
  ICanvas2D,
  IGradient,
} from '../lib/core/canvas';

export interface RecordedCommand {
  type: string;
  args: unknown[];
}

export class MockCanvas implements ICanvas2D {
  public commands: RecordedCommand[] = [];

  public fillStyle: string | IGradient = '#000000';
  public strokeStyle: string | IGradient = '#000000';
  public lineWidth = 1;
  public lineCap: CanvasLineCap = 'butt';
  public lineJoin: CanvasLineJoin = 'miter';
  public globalAlpha = 1;
  public font = '12px sans-serif';
  public textAlign: CanvasTextAlign = 'start';
  public textBaseline: CanvasTextBaseline = 'alphabetic';

  public clear(): void {
    this.commands = [];
  }

  /** 按类型过滤命令参数。 */
  public of(type: string): unknown[][] {
    return this.commands
      .filter((c) => c.type === type)
      .map((c) => c.args);
  }

  /* —— 状态 —— */

  public save(): void {
    this.log('save');
  }
  public restore(): void {
    this.log('restore');
  }
  public translate(x: number, y: number): void {
    this.log('translate', x, y);
  }
  public scale(x: number, y: number): void {
    this.log('scale', x, y);
  }
  public rotate(angle: number): void {
    this.log('rotate', angle);
  }

  /* —— 路径 —— */

  public beginPath(): void {
    this.log('beginPath');
  }
  public closePath(): void {
    this.log('closePath');
  }
  public moveTo(x: number, y: number): void {
    this.log('moveTo', x, y);
  }
  public lineTo(x: number, y: number): void {
    this.log('lineTo', x, y);
  }
  public bezierCurveTo(
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number
  ): void {
    this.log('bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y);
  }
  public arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean
  ): void {
    this.log('arc', x, y, radius, startAngle, endAngle, counterclockwise ?? false);
  }
  public arcTo(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    radius: number
  ): void {
    this.log('arcTo', x1, y1, x2, y2, radius);
  }
  public rect(x: number, y: number, width: number, height: number): void {
    this.log('rect', x, y, width, height);
  }
  public ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean
  ): void {
    this.log(
      'ellipse',
      x,
      y,
      radiusX,
      radiusY,
      rotation,
      startAngle,
      endAngle,
      counterclockwise ?? false
    );
  }

  /* —— 绘制 —— */

  public fill(): void {
    this.log('fill');
  }
  public stroke(): void {
    this.log('stroke');
  }
  public fillRect(x: number, y: number, width: number, height: number): void {
    this.log('fillRect', x, y, width, height);
  }
  public clearRect(x: number, y: number, width: number, height: number): void {
    this.log('clearRect', x, y, width, height);
  }
  public clip(): void {
    this.log('clip');
  }
  public setLineDash(segments: readonly number[]): void {
    this.log('setLineDash', segments);
  }

  /* —— 渐变 —— */

  public createLinearGradient(
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): IGradient {
    this.log('createLinearGradient', x0, y0, x1, y1);
    return mockGradient();
  }
  public createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number
  ): IGradient {
    this.log('createRadialGradient', x0, y0, r0, x1, y1, r1);
    return mockGradient();
  }

  /* —— 文字 —— */

  public fillText(text: string, x: number, y: number): void {
    this.log('fillText', text, x, y);
  }
  public measureText(text: string): { width: number } {
    return { width: text.length * 6 };
  }

  private log(type: string, ...args: unknown[]): void {
    this.commands.push({ type, args });
  }
}

function mockGradient(): IGradient {
  const stops: Array<[number, string]> = [];
  return {
    addColorStop(offset: number, color: string): void {
      stops.push([offset, color]);
    },
  };
}

/** 便捷：创建已渲染一次图表的 MockCanvas 辅助（按需使用）。 */
export function renderAndCapture(chart: { render(): unknown }): MockCanvas {
  const canvas = new MockCanvas();
  // 占位：图表实例在构造时已持有自己的 canvas，见各测试文件
  void chart;
  return canvas;
}
