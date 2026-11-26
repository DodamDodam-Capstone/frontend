// FE-internal development paths, not backend endpoints or published deep links.
export const ROUTES = {
  login: '/login',
  childRegistration: '/children/register',
  home: '/home',
} as const;
export const HOME_DESTINATIONS = {
  guardian: '/guardian',
  conversation: '/conversation',
} as const;

export type HomeDestination =
  | { route: typeof HOME_DESTINATIONS.guardian; childId: string }
  | { route: typeof HOME_DESTINATIONS.conversation; childId: string; intent: 'start' }
  | { route: typeof HOME_DESTINATIONS.conversation; childId: string; intent: 'resume'; conversationId: string };

export type RouteName = keyof typeof ROUTES;
export type RoutePath = (typeof ROUTES)[RouteName];
