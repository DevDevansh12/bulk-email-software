/**
 * Auth API — Supabase edition.
 * Email verification is disabled — users are auto-confirmed on register.
 */
import { supabase } from '@/lib/supabase';
import { apiClient } from '@/lib/api-client';
import type {
  RegisterBody,
  LoginBody,
  ForgotPasswordBody,
  ResetPasswordBody,
  ChangePasswordBody,
  MessageResponse,
  PublicUser,
  ApiSuccessResponse,
} from '@saas/shared';

export const authApi = {
  register: async (body: RegisterBody) => {
    const { data, error } = await supabase.auth.signUp({
      email: body.email,
      password: body.password,
      options: {
        data: {
          firstName: body.firstName,
          lastName: body.lastName,
          role: 'member',
        },
      },
    });

    if (error) {
      // Use user-friendly error messages without revealing system details
      const errorMsg = error.message.toLowerCase();
      if (errorMsg.includes('already') || errorMsg.includes('exists')) {
        throw new Error('This email is already registered. Please sign in instead.');
      }
      if (errorMsg.includes('invalid') && errorMsg.includes('email')) {
        throw new Error('Please enter a valid email address.');
      }
      if (errorMsg.includes('password')) {
        throw new Error('Password does not meet requirements. Please try a stronger password.');
      }
      // Generic fallback
      throw new Error('Registration failed. Please try again or contact support.');
    }

    if (!data.user) {
      throw new Error('Registration failed. Please try again.');
    }

    const meta = (data.user.user_metadata ?? {}) as Record<string, string>;

    // If email confirmation is enabled in Supabase, data.session will be null
    if (!data.session) {
      // Return a partial response - UI should show "check your email" message
      return {
        accessToken: '',
        expiresIn: 0,
        user: {
          id: data.user.id,
          email: data.user.email ?? '',
          firstName: meta['firstName'] ?? body.firstName,
          lastName: meta['lastName'] ?? body.lastName,
          role: 'member' as PublicUser['role'],
          isEmailVerified: false,
          createdAt: data.user.created_at,
          updatedAt: data.user.updated_at ?? data.user.created_at,
        },
        requiresEmailConfirmation: true,
      };
    }

    return {
      accessToken: data.session.access_token,
      expiresIn: data.session.expires_in,
      user: {
        id: data.user.id,
        email: data.user.email ?? '',
        firstName: meta['firstName'] ?? body.firstName,
        lastName: meta['lastName'] ?? body.lastName,
        role: (meta['role'] ?? 'member') as PublicUser['role'],
        isEmailVerified: !!data.user.email_confirmed_at,
        createdAt: data.user.created_at,
        updatedAt: data.user.updated_at ?? data.user.created_at,
      },
    };
  },

  login: async (body: LoginBody) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });

    if (error) {
      // Use generic error message to prevent email enumeration
      const errorMsg = error.message.toLowerCase();
      if (errorMsg.includes('invalid') || errorMsg.includes('credentials') || errorMsg.includes('password')) {
        throw new Error('Invalid email or password. Please try again.');
      }
      if (errorMsg.includes('email not confirmed') || errorMsg.includes('verify')) {
        throw new Error('Please verify your email before signing in.');
      }
      // Generic fallback
      throw new Error('Sign in failed. Please try again.');
    }

    if (!data.session || !data.user) {
      throw new Error('Sign in failed. Please try again.');
    }

    const meta = (data.user.user_metadata ?? {}) as Record<string, string>;
    const appMeta = (data.user.app_metadata ?? {}) as Record<string, string>;

    return {
      accessToken: data.session.access_token,
      expiresIn: data.session.expires_in,
      user: {
        id: data.user.id,
        email: data.user.email ?? '',
        firstName: meta['firstName'] ?? '',
        lastName: meta['lastName'] ?? '',
        role: (appMeta['role'] ?? meta['role'] ?? 'member') as PublicUser['role'],
        isEmailVerified: true,
        createdAt: data.user.created_at,
        updatedAt: data.user.updated_at ?? data.user.created_at,
      },
    };
  },

  refresh: async () => {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session || !data.user) throw new Error('Session expired');

    const meta = (data.user.user_metadata ?? {}) as Record<string, string>;
    const appMeta = (data.user.app_metadata ?? {}) as Record<string, string>;

    return {
      accessToken: data.session.access_token,
      expiresIn: data.session.expires_in,
      user: {
        id: data.user.id,
        email: data.user.email ?? '',
        firstName: meta['firstName'] ?? '',
        lastName: meta['lastName'] ?? '',
        role: (appMeta['role'] ?? meta['role'] ?? 'member') as PublicUser['role'],
        isEmailVerified: true,
        createdAt: data.user.created_at,
        updatedAt: data.user.updated_at ?? data.user.created_at,
      } satisfies PublicUser,
    };
  },

  logout: async () => {
    await supabase.auth.signOut();
  },

  logoutAll: async () => {
    await supabase.auth.signOut({ scope: 'global' });
  },

  me: async () => {
    const { data } = await apiClient.get<ApiSuccessResponse<PublicUser>>('/auth/me');
    return data.data;
  },

  forgotPassword: async (body: ForgotPasswordBody) => {
    const { error } = await supabase.auth.resetPasswordForEmail(body.email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    if (error) throw new Error(error.message);
    return { message: 'If an account with that email exists, a password reset link has been sent.' };
  },

  resetPassword: async (body: ResetPasswordBody) => {
    const { error } = await supabase.auth.updateUser({ password: body.password });
    if (error) throw new Error(error.message);
    return { message: 'Password reset successfully.' } satisfies MessageResponse;
  },

  changePassword: async (body: ChangePasswordBody) => {
    const { data } = await apiClient.post<ApiSuccessResponse<MessageResponse>>(
      '/auth/change-password',
      body
    );
    return data.data;
  },
};
