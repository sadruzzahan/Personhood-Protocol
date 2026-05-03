// JWKS resolution moved into ./jwt to keep all key material handling in
// one place. This file is kept as a stub re-export so existing imports
// keep working — verification uses the resolver inside jwt.ts directly.
export {};
