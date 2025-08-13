import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { validateRequest } from '../../middlewares/validate-request.middleware.js';
import { requireAuth } from '../../middlewares/require-auth.middleware.js';
import {
  registerBodySchema,
  loginBodySchema,
  forgotPasswordBodySchema,
  resetPasswordBodySchema
} from './auth.schemas.js';
import { AuthService } from './auth.service.js';
import { UserRepository } from '../user/user.repository.js';
import { TenantRepository } from '../tenant/tenant.repository.js';
import { AuthController } from './auth.controller.js';

const authService = new AuthService(new UserRepository(), new TenantRepository());
const authController = new AuthController(authService);

export const authRouter = Router();

authRouter.get('/me', requireAuth, asyncHandler(authController.me));

authRouter.post(
  '/register',
  validateRequest(registerBodySchema, 'body'),
  asyncHandler(authController.register)
);

authRouter.post(
  '/login',
  validateRequest(loginBodySchema, 'body'),
  asyncHandler(authController.login)
);

authRouter.post(
  '/forgot-password',
  validateRequest(forgotPasswordBodySchema, 'body'),
  asyncHandler(authController.forgotPassword)
);

authRouter.post(
  '/reset-password',
  validateRequest(resetPasswordBodySchema, 'body'),
  asyncHandler(authController.resetPassword)
);
