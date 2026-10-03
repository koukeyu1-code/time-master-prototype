// Express 4 does not automatically forward rejected async route handlers.
export function wrapRouter(router) {
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const register = router[method].bind(router);
    router[method] = (route, ...handlers) => register(route, ...handlers.map(handler =>
      (req, res, next) => Promise.resolve().then(() => handler(req, res, next)).catch(next)));
  }
  return router;
}
