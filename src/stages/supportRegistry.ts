import { lazy, type ComponentType } from 'react';

/**
 * Support-phone views per stage (§3.5.2), rendered by src/app/screens/SupportScreen.tsx when this
 * phone isn't the main phone (wrapped in Suspense). Each loads on demand.
 */
export const supportViews: Record<1 | 2 | 3 | 4 | 5, ComponentType | undefined> = {
  1: lazy(() => import('./support/Support1')),
  2: lazy(() => import('./support/Support2')),
  3: lazy(() => import('./support/Support3')),
  4: lazy(() => import('./support/Support4')),
  5: lazy(() => import('./support/Support5')),
};
