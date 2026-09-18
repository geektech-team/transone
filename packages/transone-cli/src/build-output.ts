interface BuildOutputDescriptor {
  path: string;
  kind: string;
}

export function isEntryJavaScriptOutput(
  output: BuildOutputDescriptor
): boolean {
  return output.kind === 'entry-point' && isJavaScriptPath(output.path);
}

export function isStylesheetOutput(output: { path: string }): boolean {
  return /\.css$/i.test(output.path);
}

function isJavaScriptPath(path: string): boolean {
  return /\.(?:[cm]?js)$/i.test(path);
}
