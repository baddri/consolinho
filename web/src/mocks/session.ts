/** Persona the mock backend starts with and returns to after every test (`test/setup.ts`). */
export const DEFAULT_MOCK_USER = 'admin';

let mockUser: string | null = DEFAULT_MOCK_USER;

/**
 * Switches the signed-in mock user (a username from `fixtures/users.ts`). `null` = no session: every authenticated
 * endpoint answers 401 `Auth.Unauthenticated`. A deactivated or unknown username behaves like an ended session.
 */
export function setMockUser(username: string | null): void {
  mockUser = username;
}

/** Username of the signed-in mock user, or `null` when signed out. */
export function getMockUser(): string | null {
  return mockUser;
}
