import express from 'express';
import validate from '../middleware/validate.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import catchAsyncErrors from '../utils/catchAsyncErrors.js';
import {
  register,
  login,
  getProfile,
  updateProfile,
  forgotPassword,
  resetPasswordHandler,
  loginSocial,
  logout,
  deleteAccountHandler,
  registerSchema,
  loginSchema,
  profileUpdateSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  loginSocialSchema,
} from '../controllers/authController.js';

const router = express.Router();

router.post('/register', validate(registerSchema), catchAsyncErrors(register));
router.post('/login', validate(loginSchema), catchAsyncErrors(login));
router.post('/login/social', validate(loginSocialSchema), catchAsyncErrors(loginSocial));
router.post('/forgot-password', validate(forgotPasswordSchema), catchAsyncErrors(forgotPassword));
router.post(
  '/reset-password',
  validate(resetPasswordSchema),
  catchAsyncErrors(resetPasswordHandler),
);
router.post('/logout', authMiddleware, catchAsyncErrors(logout));

router.get('/profile', authMiddleware, catchAsyncErrors(getProfile));
router.put(
  '/profile',
  authMiddleware,
  validate(profileUpdateSchema),
  catchAsyncErrors(updateProfile),
);
router.delete('/account', authMiddleware, catchAsyncErrors(deleteAccountHandler));

export default router;
