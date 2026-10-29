import { build } from './build';
import { createProject } from './create';
import { startDevServer } from './server';
import {
  getPlatformDefinition,
  normalizePlatform,
  PLATFORM_DEFINITIONS,
} from 'transone/platform';
import { TARGET_TYPES } from './target/types';
import type { TargetInput } from './types';

const USAGE = [
  'Usage:',
  '  transone create',
  '  transone dev [--target <web|web-mobile|web-pc>] [--host <host>] [--port <port>] [--base <path>] [--no-watch]',
  '  transone build [--target <target>] [--out-dir <path>] [--base <path>] [--library]',
  '',
  `Targets: ${PLATFORM_DEFINITIONS.map((definition) => definition.platform).join(', ')} (default: web)`,
  `Compatible backend aliases: ${TARGET_TYPES.filter((target) => target !== 'web').join(', ')}`,
].join('\n');

const FLAG_OPTIONS = new Set(['--no-watch', '--library']);

export interface CreateCliArgs {
  command: 'create';
}

export interface DevCliArgs {
  command: 'dev';
  target?: TargetInput;
  host?: string;
  port?: number;
  base?: string;
  noWatch?: boolean;
}

export interface BuildCliArgs {
  command: 'build';
  target?: TargetInput;
  outDir?: string;
  base?: string;
  library?: boolean;
}

export type CliArgs = CreateCliArgs | DevCliArgs | BuildCliArgs;

export function parseCliArgs(argv: string[]): CliArgs {
  const command = argv[0];
  if (command !== 'create' && command !== 'dev' && command !== 'build') {
    throw parseError(
      command === undefined ? 'Missing command' : `Unknown command: ${command}`
    );
  }

  const options = new Map<string, string>();
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      throw parseError(`Unexpected positional argument: ${token}`);
    }

    const { name, inlineValue } = splitOption(token);
    assertKnownOption(name);
    assertSupportedOption(command, name);
    if (options.has(name)) {
      throw parseError(`Duplicate option: ${name}`);
    }
    if (FLAG_OPTIONS.has(name)) {
      options.set(name, 'true');
      continue;
    }

    const value = inlineValue ?? argv[index + 1];
    if (value === undefined || value === '' || value.startsWith('--')) {
      throw parseError(`Missing value for option: ${name}`);
    }
    if (inlineValue === undefined) {
      index += 1;
    }
    options.set(name, value);
  }

  if (command === 'create') {
    return { command };
  }

  if (command === 'dev') {
    const port = options.get('--port');
    const target = options.has('--target')
      ? parseTarget(options.get('--target'))
      : undefined;
    if (
      target !== undefined &&
      getPlatformDefinition(normalizePlatform(target)!).family !== 'web'
    ) {
      throw parseError(
        'Development server only supports Web targets: web, web-mobile, web-pc'
      );
    }
    return {
      command,
      ...(target === undefined ? {} : { target }),
      ...(options.has('--host') ? { host: options.get('--host') } : {}),
      ...(port === undefined ? {} : { port: parsePort(port) }),
      ...(options.has('--base') ? { base: options.get('--base') } : {}),
      ...(options.has('--no-watch') ? { noWatch: true } : {}),
    };
  }

  return {
    command,
    ...(options.has('--target')
      ? { target: parseTarget(options.get('--target')) }
      : {}),
    ...(options.has('--out-dir') ? { outDir: options.get('--out-dir') } : {}),
    ...(options.has('--base') ? { base: options.get('--base') } : {}),
    ...(options.has('--library') ? { library: true } : {}),
  };
}

export async function runCli(
  argv: string[] = process.argv.slice(2)
): Promise<void> {
  const args = parseCliArgs(argv);

  if (args.command === 'create') {
    const result = createProject();
    console.log(
      `TransOne project created at ${result.root} (${result.files.length} files)`
    );
    return;
  }

  if (args.command === 'dev') {
    const devOptions = {
      ...(args.target === undefined ? {} : { target: args.target }),
      ...(args.host === undefined ? {} : { host: args.host }),
      ...(args.port === undefined ? {} : { port: args.port }),
      ...(args.base === undefined ? {} : { base: args.base }),
      watch: !args.noWatch,
    };
    const server = await startDevServer(devOptions);
    console.log(
      `TransOne dev server listening at http://${server.hostname}:${server.port}`
    );
    return;
  }

  const result = await build(
    args.outDir === undefined &&
      args.base === undefined &&
      !args.library &&
      args.target === undefined
      ? {}
      : {
          target: args.target,
          outDir: args.outDir,
          base: args.base,
          library: args.library,
        }
  );
  console.log(
    `TransOne build completed: ${result.outDir} (${result.assetsBuilt.length} assets)`
  );
}

function splitOption(token: string): { name: string; inlineValue?: string } {
  const equalsIndex = token.indexOf('=');
  if (equalsIndex === -1) {
    return { name: token };
  }

  return {
    name: token.slice(0, equalsIndex),
    inlineValue: token.slice(equalsIndex + 1),
  };
}

function assertKnownOption(name: string): void {
  if (
    name === '--host' ||
    name === '--port' ||
    name === '--out-dir' ||
    name === '--no-watch' ||
    name === '--library' ||
    name === '--base' ||
    name === '--target'
  ) {
    return;
  }

  throw parseError(`Unknown option: ${name}`);
}

function assertSupportedOption(
  command: CliArgs['command'],
  name: string
): void {
  const supported =
    (command === 'create' && false) ||
    (command === 'dev' &&
      (name === '--host' ||
        name === '--target' ||
        name === '--port' ||
        name === '--base' ||
        name === '--no-watch')) ||
    (command === 'build' &&
      (name === '--target' ||
        name === '--out-dir' ||
        name === '--base' ||
        name === '--library'));

  if (!supported) {
    throw parseError(`Option ${name} is not supported for ${command}`);
  }
}

function parseTarget(value: string | undefined): TargetInput {
  if (value === undefined || normalizePlatform(value) === undefined) {
    throw parseError(
      `Unknown target: ${value ?? ''}\nAvailable targets: ${PLATFORM_DEFINITIONS.map((definition) => definition.platform).join(', ')}`
    );
  }
  return value as TargetInput;
}

function parsePort(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw parseError('Port must be an integer between 0 and 65535');
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw parseError('Port must be an integer between 0 and 65535');
  }

  return port;
}

function parseError(message: string): Error {
  return new Error(`${message}\n\n${USAGE}`);
}
