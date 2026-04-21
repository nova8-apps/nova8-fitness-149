// Thin re-export so either `@/lib/api` or `@/lib/apiClient` works.
// All the real logic lives in apiClient.ts.
export * from './apiClient';
export { api as default } from './apiClient';
