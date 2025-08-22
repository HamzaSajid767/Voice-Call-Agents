import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { requireAuth } from '../../middlewares/require-auth.middleware.js';
import { requireClient } from '../../middlewares/require-client.middleware.js';
import { requireSuperAdmin } from '../../middlewares/require-superadmin.middleware.js';
import { validateRequest } from '../../middlewares/validate-request.middleware.js';
import { createUserBodySchema, listUsersQuerySchema } from './user.schemas.js';
import { UserService } from './user.service.js';
import { UserRepository } from './user.repository.js';
import { UserController } from './user.controller.js';

const userService = new UserService(new UserRepository());
const userController = new UserController(userService);

export const userRouter = Router();

userRouter.get('/me', requireAuth, requireClient, asyncHandler(userController.getMe));
userRouter.get(
  '/',
  requireAuth,
  requireSuperAdmin,
  validateRequest(listUsersQuerySchema, 'query'),
  asyncHandler(userController.list)
);
userRouter.post(
  '/',
  requireAuth,
  requireSuperAdmin,
  validateRequest(createUserBodySchema, 'body'),
  asyncHandler(userController.create)
);
