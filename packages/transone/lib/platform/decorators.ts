/** Compile-time markers. Return the same class and never register runtime targets. */
function platformDecorator() {
  return <T extends abstract new (...args: any[]) => any>(
    value: T,
    _context: ClassDecoratorContext<T>
  ): T => value;
}

export const Web = platformDecorator;
export const WebMobile = platformDecorator;
export const WebPc = platformDecorator;
export const Miniprogram = platformDecorator;
export const MiniprogramWeixin = platformDecorator;
export const MiniprogramAlipay = platformDecorator;
export const MiniprogramBytedance = platformDecorator;
export const MiniprogramXiaohongshu = platformDecorator;
export const App = platformDecorator;
export const AppIos = platformDecorator;
export const AppAndroid = platformDecorator;
export const AppHarmony = platformDecorator;
