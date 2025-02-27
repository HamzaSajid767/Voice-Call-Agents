import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { findUserByPublicId } from '../utils/resolveUserId.js';
import { attachInviteAfterUserCreated } from './inviteProgramService.js';
import { sendPasswordResetOtpEmail, OTP_EXPIRY_MINUTES } from '../utils/email.js';

const generateToken = (user) => {
  const payload = {
    id: user.id,
    role: user.role,
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

const toPublicUser = (user) => ({
  id: user.id,
  username: user.username,
  email: user.email,
  role: user.role,
});

const registerUser = async ({ username, email, password, inviteCode, registrationIp }) => {
  const emailNorm = String(email).toLowerCase().trim();
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: emailNorm }, { username }] },
  });
  if (existing) {
    const err = new Error(
      existing.email === emailNorm ? 'Email already in use' : 'Username already in use',
    );
    err.statusCode = 400;
    throw err;
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      username,
      email: emailNorm,
      passwordHash,
      registrationIp: registrationIp || null,
    },
  });

  await attachInviteAfterUserCreated(user, { inviteCode, registrationIp });

  const token = generateToken(user);

  return {
    token,
    user: toPublicUser(user),
  };
};

const requestPasswordReset = async ({ email }) => {
  const emailNorm = String(email).toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email: emailNorm } });
  if (!user) {
    return;
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const resetPasswordToken = crypto.createHash('sha256').update(otp).digest('hex');
  const resetPasswordExpires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: { resetPasswordToken, resetPasswordExpires },
  });

  await sendPasswordResetOtpEmail(user.email, otp);
};

const resetPassword = async ({ email, otp, newPassword }) => {
  const emailNorm = String(email).toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email: emailNorm } });
  if (!user) {
    const err = new Error('Invalid or expired OTP');
    err.statusCode = 400;
    throw err;
  }

  const hashedOtp = crypto.createHash('sha256').update(String(otp)).digest('hex');
  const valid =
    user.resetPasswordToken === hashedOtp &&
    user.resetPasswordExpires &&
    user.resetPasswordExpires > new Date();

  if (!valid) {
    const err = new Error('Invalid or expired OTP');
    err.statusCode = 400;
    throw err;
  }

  const passwordHash = await hashPassword(newPassword);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    },
  });

  return {
    token: generateToken(updated),
    user: toPublicUser(updated),
  };
};

async function ensureUniqueUsername(base) {
  let candidate = base;
  let n = 0;
  while (await prisma.user.findUnique({ where: { username: candidate } })) {
    n += 1;
    candidate = `${base}${n}`;
  }
  return candidate;
};

const loginWithSocial = async ({
  provider,
  providerId,
  email,
  username,
  inviteCode,
  registrationIp,
}) => {
  const emailNorm = String(email).toLowerCase().trim();

  let user = await prisma.user.findFirst({
    where: {
      OR: [{ provider, providerId }, { email: emailNorm }],
    },
  });

  if (!user) {
    const base = (username && String(username).trim()) || emailNorm.split('@')[0];
    const usernameFinal = await ensureUniqueUsername(base);
    const randomPass = crypto.randomBytes(24).toString('hex');
    const passwordHash = await hashPassword(randomPass);

    user = await prisma.user.create({
      data: {
        provider,
        providerId,
        email: emailNorm,
        username: usernameFinal,
        passwordHash,
        registrationIp: registrationIp || null,
      },
    });
    await attachInviteAfterUserCreated(user, { inviteCode, registrationIp });
  } else if (!user.provider || user.providerId !== providerId) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { provider, providerId },
    });
  }

  return {
    token: generateToken(user),
    user: toPublicUser(user),
  };
};

const loginUser = async ({ email, password }) => {
  const emailNorm = String(email).toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email: emailNorm } });
  if (!user || !user.passwordHash) {
    const err = new Error('Invalid credentials');
    err.statusCode = 400;
    throw err;
  }

  const isMatch = await comparePassword(password, user.passwordHash);
  if (!isMatch) {
    const err = new Error('Invalid credentials');
    err.statusCode = 400;
    throw err;
  }

  const token = generateToken(user);

  return {
    token,
    user: toPublicUser(user),
  };
};

const getUserProfile = async (userId) => {
  const user = await findUserByPublicId(userId);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

const updateUserProfile = async (userId, updates) => {
  const user = await findUserByPublicId(userId);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  if (updates.username != null && updates.username !== user.username) {
    const taken = await prisma.user.findFirst({
      where: { username: updates.username, NOT: { id: user.id } },
    });
    if (taken) {
      const err = new Error('Username already in use');
      err.statusCode = 400;
      throw err;
    }
  }

  const data = {};
  if (updates.username != null) data.username = updates.username;
  if (updates.password != null) {
    data.passwordHash = await hashPassword(updates.password);
  }

  const next = await prisma.user.update({
    where: { id: user.id },
    data,
  });

  return {
    id: next.id,
    username: next.username,
    email: next.email,
    role: next.role,
    createdAt: next.createdAt,
    updatedAt: next.updatedAt,
  };
};

const deleteAccount = async (userId) => {
  const user = await findUserByPublicId(userId);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  await prisma.user.delete({ where: { id: user.id } });
};

export {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  requestPasswordReset,
  resetPassword,
  loginWithSocial,
  deleteAccount,
};
