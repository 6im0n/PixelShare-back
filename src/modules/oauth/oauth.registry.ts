import { NotFoundException } from '@nestjs/common';
import { googleProvider } from './providers/google';
import type { OAuthProvider } from './oauth.types';

const providers = new Map<string, OAuthProvider>([[googleProvider.name, googleProvider]]);

export function getOAuthProvider(name: string): OAuthProvider {
  const provider = providers.get(name);
  if (!provider) throw new NotFoundException(`unknown oauth provider: ${name}`);
  return provider;
}

export function listOAuthProviders(): string[] {
  return [...providers.keys()];
}
