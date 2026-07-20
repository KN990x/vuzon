/**
 * Express 4 does not catch promise rejections in async handlers; this wrapper sends them to `next(err)`.
 */
export function asyncHandler(fn) {
  return function asyncHandlerWrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
