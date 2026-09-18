/** 小程序编译错误：携带出错文件，便于定位不可静态编译的源码。 */
export class MpCompileError extends Error {
  public readonly file: string;

  constructor(file: string, message: string) {
    super(`${message} (${file})`);
    this.name = 'MpCompileError';
    this.file = file;
  }
}

export function mpError(file: string, message: string): MpCompileError {
  return new MpCompileError(file, message);
}
