import type { Redis } from 'ioredis';

export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<'OK'>;
  setEx(key: string, value: string, ttlSeconds: number): Promise<'OK'>;
  setNxEx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  incr(key: string): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<number>;
  ping(): Promise<string>;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

export class RedisAdapter implements RedisLike {
  public constructor(private readonly client: Redis) {}

  public get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  public async set(key: string, value: string): Promise<'OK'> {
    const res = await this.client.set(key, value);
    return res;
  }

  public async setEx(key: string, value: string, ttlSeconds: number): Promise<'OK'> {
    const res = await this.client.set(key, value, 'EX', ttlSeconds);
    return res;
  }

  public async setNxEx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const res = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return res === 'OK';
  }

  public incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  public expire(key: string, ttlSeconds: number): Promise<number> {
    return this.client.expire(key, ttlSeconds);
  }

  public ping(): Promise<string> {
    return this.client.ping();
  }

  public on(event: string, listener: (...args: unknown[]) => void): void {
    this.client.on(event, listener);
  }
}

