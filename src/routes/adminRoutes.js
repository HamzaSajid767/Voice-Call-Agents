import express from 'express';
import validate from '../middleware/validate.js';
import { authMiddleware, authorizeRoles } from '../middleware/authMiddleware.js';
import catchAsyncErrors from '../utils/catchAsyncErrors.js';
import { deleteUser, listUsers, updateUser } from '../controllers/adminUserController.js';
import {
  deleteUserAdminSchema,
  listUsersAdminSchema,
  updateUserAdminSchema,
} from '../validators/adminValidators.js';

const router = express.Router();

router.get(
  '/users',
  authMiddleware,
  authorizeRoles('admin'),
  validate(listUsersAdminSchema),
  catchAsyncErrors(listUsers),
);

router.patch(
  '/users/:id',
  authMiddleware,
  authorizeRoles('admin'),
  validate(updateUserAdminSchema),
  catchAsyncErrors(updateUser),
);

router.delete(
  '/users/:id',
  authMiddleware,
  authorizeRoles('admin'),
  validate(deleteUserAdminSchema),
  catchAsyncErrors(deleteUser),
);

export default router;
