// FE-internal development paths, not backend endpoints or published deep links.
export const ROUTES = {
  login: '/login',
  childRegistration: '/children/register',
  home: '/home',
} as const;
export type RouteName = keyof typeof ROUTES;
export type RoutePath = (typeof ROUTES)[RouteName];
