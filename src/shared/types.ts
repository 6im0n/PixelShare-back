export type UserRole = 'admin' | 'photographer' | 'client';

export type JwtPayload = {
  sub: string;
  role: UserRole;
  type: 'access' | 'refresh';
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};
