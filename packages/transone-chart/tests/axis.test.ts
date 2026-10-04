import { expect, test } from 'bun:test';
import { AxisDrawer } from '../lib/core/axis';
import { LinearScale } from '../lib/core/scale';
import { MockCanvas } from './mock-canvas';

test('底部数值轴的网格沿竖向跨越绘图区', () => {
  const canvas = new MockCanvas();
  new AxisDrawer(canvas).drawValueAxis({
    plot: { x: 50, y: 12, width: 200, height: 100 },
    scale: new LinearScale(0, 10, 50, 250, { min: 0, max: 10, splitCount: 2 }),
    labels: ['0', '5', '10'],
    horizontal: true,
  });
  expect(canvas.of('moveTo')).toEqual([
    [50, 12],
    [150, 12],
    [250, 12],
  ]);
  expect(canvas.of('lineTo')).toEqual([
    [50, 112],
    [150, 112],
    [250, 112],
  ]);
});
