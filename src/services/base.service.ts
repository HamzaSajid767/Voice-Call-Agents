import { InternalServerError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export abstract class BaseService {
  protected async execute<T>(operationName: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      logger.error({ err: error, operationName }, 'Service operation failed');
      if (error instanceof Error) {
        throw error;
      }
      throw new InternalServerError('Unexpected service failure');
    }
  }
}
