declare module 'redis' {
  export type RedisClientType<M = any, F = any, S = any> = Record<string, any>;

  export type RedisClientOptions = { url?: string } & Record<string, any>;

  export function createClient(options?: RedisClientOptions): RedisClientType;
}
