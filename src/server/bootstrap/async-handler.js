/**
 * Express 4 no captura rechazos de promesas en handlers async; este wrapper los envía a `next(err)`.
 */
export function asyncHandler(fn) {
  return function asyncHandlerWrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
