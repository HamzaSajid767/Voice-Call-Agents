import Joi from 'joi';

const registerSchema = Joi.object({
  body: Joi.object({
    username: Joi.string().required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    inviteCode: Joi.string().trim().max(64).allow('', null),
  }).required(),
});

const loginSchema = Joi.object({
  body: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  }).required(),
});

const profileUpdateSchema = Joi.object({
  body: Joi.object({
    username: Joi.string(),
    password: Joi.string().min(6),
  }),
});

const forgotPasswordSchema = Joi.object({
  body: Joi.object({
    email: Joi.string().email().required(),
  }).required(),
});

const resetPasswordSchema = Joi.object({
  body: Joi.object({
    email: Joi.string().email().required(),
    otp: Joi.string().length(6).pattern(/^\d+$/).required(),
    newPassword: Joi.string().min(6).required(),
  }).required(),
});

const loginSocialSchema = Joi.object({
  body: Joi.object({
    provider: Joi.string().valid('google', 'facebook', 'apple').required(),
    providerId: Joi.string().required(),
    email: Joi.string().email().required(),
    username: Joi.string().allow('', null),
    inviteCode: Joi.string().trim().max(64).allow('', null),
  }).required(),
});

export {
  registerSchema,
  loginSchema,
  profileUpdateSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  loginSocialSchema,
};
