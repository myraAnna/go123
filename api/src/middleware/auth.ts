import type { MiddlewareHandler } from 'hono';

declare module 'hono' {
  interface ContextVariableMap {
    merchantId: string;
  }
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  c.set('merchantId', c.req.header('X-Merchant-Id') ?? '1');
  await next();
};
