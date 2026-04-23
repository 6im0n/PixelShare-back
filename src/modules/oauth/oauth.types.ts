export type OAuthProfile = {
  providerId: string;
  email: string;
  name: string;
};

export type AuthorizationUrlArgs = {
  state: string;
  clientId: string;
  redirectUri: string;
};

export type ExchangeCodeArgs = {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type OAuthProvider = {
  name: string;
  authorizationUrl(args: AuthorizationUrlArgs): string;
  exchangeCode(args: ExchangeCodeArgs): Promise<OAuthProfile>;
};
