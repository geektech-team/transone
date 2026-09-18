import { lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export async function assertSafeSubdirectory(
  root: string,
  path: string,
  errorMessage: string
): Promise<void> {
  try {
    const canonicalRoot = await realpath(root);
    const canonicalPath = await canonicalizePotentialPath(path);

    if (!isStrictSubdirectory(canonicalRoot, canonicalPath)) {
      throw new Error(errorMessage);
    }
  } catch {
    throw new Error(errorMessage);
  }
}

export async function assertSafeSubdirectoryDoesNotContain(
  root: string,
  path: string,
  protectedPath: string,
  errorMessage: string
): Promise<void> {
  try {
    const lexicalPath = resolve(path);
    const lexicalProtectedPath = resolve(protectedPath);
    const canonicalRoot = await realpath(root);
    const canonicalPath = await canonicalizePotentialPath(path);
    const canonicalProtectedPath = await realpath(protectedPath);

    if (
      !isStrictSubdirectory(canonicalRoot, canonicalPath) ||
      isPathWithinOrEqual(lexicalPath, lexicalProtectedPath) ||
      isPathWithinOrEqual(canonicalPath, canonicalProtectedPath)
    ) {
      throw new Error(errorMessage);
    }
  } catch {
    throw new Error(errorMessage);
  }
}

async function canonicalizePotentialPath(path: string): Promise<string> {
  const ancestor = await findExistingAncestor(path);
  const canonicalAncestor = await realpath(ancestor);
  return resolve(canonicalAncestor, relative(ancestor, path));
}

async function findExistingAncestor(path: string): Promise<string> {
  let candidate = path;

  while (candidate !== dirname(candidate)) {
    try {
      await lstat(candidate);
      return candidate;
    } catch (error: unknown) {
      if (!isMissingPathError(error)) {
        throw error;
      }
    }

    candidate = dirname(candidate);
  }

  await lstat(candidate);
  return candidate;
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

function isStrictSubdirectory(root: string, path: string): boolean {
  const pathFromRoot = relative(root, path);
  return (
    pathFromRoot !== '' &&
    pathFromRoot !== '..' &&
    !pathFromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromRoot)
  );
}

function isPathWithinOrEqual(parent: string, candidate: string): boolean {
  const pathFromParent = relative(parent, candidate);
  return (
    pathFromParent === '' ||
    (pathFromParent !== '..' &&
      !pathFromParent.startsWith(`..${sep}`) &&
      !isAbsolute(pathFromParent))
  );
}
