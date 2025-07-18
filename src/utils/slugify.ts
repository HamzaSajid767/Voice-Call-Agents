import { randomBytes } from 'node:crypto';

const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,78}[a-z0-9])?$/;

export const slugify = (raw: string): string => {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

export const isValidTenantSlug = (slug: string): boolean => SLUG_RE.test(slug) && slug.length >= 2;

export const uniqueSlugAttempt = (base: string, attempt: number): string => {
  if (attempt === 0) {
    return base;
  }
  const suffix = randomBytes(3).toString('hex');
  return `${base}-${suffix}`;
};
