import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { comparePassword, hashPassword } from '../../utils/password.js';
import { BaseService } from '../../services/base.service.js';
import { ApiKeyRepository, type ApiKeyListRow } from './api-key.repository.js';
import { ConflictError, AuthError } from '../../lib/errors.js';

export class ApiKeyService extends BaseService {
  public constructor(private readonly apiKeyRepository: ApiKeyRepository) {
    super();
  }

  public list = (tenantId: string): Promise<ApiKeyListRow[]> => {
    return this.execute('apiKey.list', async () => {
      return this.apiKeyRepository.listByTenant(tenantId);
    });
  };

  public create = (tenantId: string, name: string): Promise<{ name: string; keyPrefix: string; rawKey: string; id: string; createdAt: string }> => {
    return this.execute('apiKey.create', async () => {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const randomPart = randomBytes(24).toString('base64url');
        const rawKey = `cak_${randomPart}`;
        const keyPrefix = rawKey.substring(0, 16);
        if (keyPrefix.length !== 16) {
          throw new ConflictError('Key prefix could not be generated');
        }
        const keyHash = await hashPassword(rawKey);

        try {
          const created = await this.apiKeyRepository.create(
            {
              tenantId,
              name,
              keyPrefix,
              keyHash,
              status: 'ACTIVE'
            },
            tenantId
          );
          return {
            id: created.id,
            name: created.name,
            keyPrefix: created.keyPrefix,
            rawKey,
            createdAt: created.createdAt.toISOString()
          };
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && attempt < 5) {
            continue;
          }
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ConflictError('Could not allocate a unique API key prefix');
          }
          throw error;
        }
      }
      throw new ConflictError('Could not allocate a unique API key');
    });
  };

  public verify = (
    rawKey: string
  ): Promise<{ tenantId: string; keyId: string }> => {
    return this.execute('apiKey.verify', async () => {
      if (!rawKey.startsWith('cak_') || rawKey.length < 20) {
        throw new AuthError('Invalid API key');
      }
      const keyPrefix = rawKey.substring(0, 16);
      const record = await this.apiKeyRepository.findByKeyPrefix(keyPrefix);
      if (!record) {
        throw new AuthError('Invalid API key');
      }
      if (record.deletedAt || record.revokedAt) {
        throw new AuthError('API key is inactive');
      }
      if (record.status !== 'ACTIVE') {
        throw new AuthError('API key is inactive');
      }
      if (record.expiresAt && record.expiresAt < new Date()) {
        throw new AuthError('API key expired');
      }
      const ok = await comparePassword(rawKey, record.keyHash);
      if (!ok) {
        throw new AuthError('Invalid API key');
      }
      return { tenantId: record.tenantId, keyId: record.id };
    });
  };
}
