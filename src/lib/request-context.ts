import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestContext } from '../types/request-context.js';

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export const RequestContextStore = {
  run<T>(context: RequestContext, callback: () => T): T {
    return requestContextStorage.run(context, callback);
  },
  get(): RequestContext | undefined {
    return requestContextStorage.getStore();
  },
  setTenantId(tenantId: string): void {
    const current = requestContextStorage.getStore();
    if (!current) {
      return;
    }
    current.tenantId = tenantId;
  }
  ,
  setUserId(userId: string): void {
    const current = requestContextStorage.getStore();
    if (!current) {
      return;
    }
    current.userId = userId;
  }
};
