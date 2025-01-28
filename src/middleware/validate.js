import Joi from 'joi';

const validate = (schema) => (req, res, next) => {
  const data = {
    body: req.body,
    query: req.query,
    params: req.params,
  };

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    allowUnknown: true,
    stripUnknown: true,
  });

  if (error) {
    return res.status(400).json({
      message: 'Validation error',
      details: error.details.map((d) => d.message),
    });
  }

  if (value.body) req.body = value.body;

  // req.query and req.params are read-only in Express; store validated values on req.validated
  req.validated = {
    ...(req.validated || {}),
    ...(value.body !== undefined && { body: value.body }),
    ...(value.query && { query: value.query }),
    ...(value.params && { params: value.params }),
  };

  if (typeof next !== 'function') {
    return res.status(500).json({ success: false, message: 'Invalid server configuration' });
  }
  return next();
};

export default validate;
