export type PublicUser = {
  id: string;
  email: string;
  fullName: string;
  status: string;
  isOwner: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export const toPublicUser = (u: {
  id: string;
  email: string;
  fullName: string;
  status: string;
  isOwner: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}): PublicUser => {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    status: String(u.status),
    isOwner: u.isOwner,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString()
  };
};
