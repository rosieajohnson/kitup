/**
 * Single source of truth for the account password policy, used everywhere a
 * password is set: sign-up, checkout guest-account creation, and password
 * reset. Keep this in sync with the Supabase dashboard password settings
 * (Authentication → Policies) so the same rules are enforced server-side.
 *
 * Policy: at least 6 characters, and must include an uppercase letter, a
 * number, and a symbol.
 */
export interface PasswordRule {
  label: string;
  test: (pw: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { label: "At least 6 characters", test: (pw) => pw.length >= 6 },
  { label: "A capital letter", test: (pw) => /[A-Z]/.test(pw) },
  { label: "A number", test: (pw) => /[0-9]/.test(pw) },
  { label: "A symbol (! ? @ # …)", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

/** Returns a human-readable error if the password fails any rule, else null. */
export function validatePassword(pw: string): string | null {
  const failed = PASSWORD_RULES.filter((r) => !r.test(pw));
  if (failed.length === 0) return null;
  return (
    "Your password needs: " +
    failed.map((r) => r.label.toLowerCase()).join(", ") +
    "."
  );
}
