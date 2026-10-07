import type { ComponentType } from 'react';

/**
 * Support-phone views per stage (§3.5.2), rendered by src/app/screens/SupportScreen.tsx when this
 * phone isn't the main phone. Stage owners register their view here (React.lazy is fine: the
 * screen wraps it in Suspense). Use `useGroup`, `useTopic`, `sendAction` and `useDealtCards`
 * from src/net/group. Undefined = the placeholder card.
 */
export const supportViews: Record<1 | 2 | 3 | 4 | 5, ComponentType | undefined> = {
  1: undefined,
  2: undefined,
  3: undefined,
  4: undefined,
  5: undefined,
};
