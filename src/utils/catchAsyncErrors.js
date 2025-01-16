const catchAsyncErrors = (thefunc) => (req, res, next) =>
  Promise.resolve(thefunc(req, res, next)).catch((err) => {
    if (typeof next === 'function') {
      return next(err);
    }
    throw err;
  });

export default catchAsyncErrors;
