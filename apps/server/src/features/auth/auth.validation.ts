import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(1, 'Password is required')
  .max(128, 'Password cannot exceed 128 characters');

// ── Register ──────────────────────────────────────────────────────────────────
export const RegisterSchema = z.object({
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(50, 'First name cannot exceed 50 characters')
    .trim(),
  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(50, 'Last name cannot exceed 50 characters')
    .trim(),
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

// ── Login ─────────────────────────────────────────────────────────────────────
export const LoginSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof LoginSchema>;

// ── Forgot password ───────────────────────────────────────────────────────────
export const ForgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
});
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

// ── Reset password ────────────────────────────────────────────────────────────
export const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

// ── Verify email ──────────────────────────────────────────────────────────────
export const VerifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});
export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;

// ── Change password (authenticated) ──────────────────────────────────────────
export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

// ── Resend verification email ─────────────────────────────────────────────────
export const ResendVerificationSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
});
export type ResendVerificationInput = z.infer<typeof ResendVerificationSchema>;

// ── Validation helper ─────────────────────────────────────────────────────────

/**
 * Parses a Zod schema and returns typed data, or throws an AppError
 * with field-level details if validation fails.
 *
 * Usage in controllers:
 *   const body = validate(RegisterSchema, req.body);
 */
import { AppError } from '../../lib/app-error.js';
import { HttpStatus } from '@saas/shared';

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    const details: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const field = issue.path.join('.') || 'general';
      if (!details[field]) details[field] = [];
      details[field]!.push(issue.message);
    }
    throw new AppError('Validation failed', HttpStatus.UNPROCESSABLE_ENTITY, 'VALIDATION_ERROR', details);
  }

  return result.data;
}
