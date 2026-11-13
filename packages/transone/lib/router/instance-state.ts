import type { Router } from './index';

// Renderer consumers only read the selected router. Keep this storage free of
// runtime Router imports so loading Component does not initialize RouterLink.
let router: Router | null = null;

export function getRouter(): Router | null {
  return router;
}

export function setCurrentRouter(value: Router | null): void {
  router = value;
}
