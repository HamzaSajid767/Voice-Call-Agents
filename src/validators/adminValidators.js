import Joi from 'joi';

const userIdParam = Joi.object({
  id: Joi.alternatives().try(Joi.string().uuid(), Joi.string().hex().length(24)).required(),
}).required();

const listUsersAdminSchema = Joi.object({
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(500).default(10),
    search: Joi.string().trim().max(200).allow('', null),
    role: Joi.string().valid('user', 'admin', 'customer', 'all').allow('', null),
    provider: Joi.string().valid('local', 'google', 'facebook', 'all').allow('', null),
    createdFrom: Joi.string().trim().max(40).allow('', null),
    createdTo: Joi.string().trim().max(40).allow('', null),
    updatedFrom: Joi.string().trim().max(40).allow('', null),
    updatedTo: Joi.string().trim().max(40).allow('', null),
    sort: Joi.string()
      .valid('createdAt', 'updatedAt', 'username', 'email', 'role')
      .default('createdAt'),
    order: Joi.string().valid('asc', 'desc').default('desc'),
  }),
});

const updateUserAdminSchema = Joi.object({
  params: userIdParam,
  body: Joi.object({
    username: Joi.string().trim().min(1).max(100).required(),
    email: Joi.string().email().trim().lowercase().required(),
    role: Joi.string().valid('user', 'admin', 'customer').required(),
  }).required(),
});

const deleteUserAdminSchema = Joi.object({
  params: userIdParam,
});

export { listUsersAdminSchema, updateUserAdminSchema, deleteUserAdminSchema };
