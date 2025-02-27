import {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  requestPasswordReset,
  resetPassword,
  loginWithSocial,
  deleteAccount,
} from '../services/userService.js';
import {
  registerSchema,
  loginSchema,
  profileUpdateSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  loginSocialSchema,
} from '../validators/userValidators.js';

function clientRegistrationIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  return req.ip || null;
}

const register = async (req, res, next) => {
  const result = await registerUser({
    username: req.body.username,
    email: req.body.email,
    password: req.body.password,
    inviteCode: req.body.inviteCode,
    registrationIp: clientRegistrationIp(req),
  });
  return res.status(201).json(result);
};

const login = async (req, res, next) => {
  const result = await loginUser(req.body);
  return res.json(result);
};

const getProfile = async (req, res, next) => {
  const profile = await getUserProfile(req.user.id);
  return res.json(profile);
};

const updateProfile = async (req, res, next) => {
  const updated = await updateUserProfile(req.user.id, req.body);
  return res.json(updated);
};

const forgotPassword = async (req, res, next) => {
  await requestPasswordReset(req.body);
  return res.json({
    message: 'If an account exists with this email, you will receive a reset link.',
  });
};

const resetPasswordHandler = async (req, res, next) => {
  const result = await resetPassword(req.body);
  return res.json(result);
};

const loginSocial = async (req, res, next) => {
  const result = await loginWithSocial({
    provider: req.body.provider,
    providerId: req.body.providerId,
    email: req.body.email,
    username: req.body.username,
    inviteCode: req.body.inviteCode,
    registrationIp: clientRegistrationIp(req),
  });
  return res.json(result);
};

const logout = async (req, res, next) => {
  return res.json({ message: 'Logged out. Discard the token on the client.' });
};

const deleteAccountHandler = async (req, res, next) => {
  await deleteAccount(req.user.id);
  return res.status(204).send();
};

export {
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
};
