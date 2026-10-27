/**
 * Reset Password page — Supabase edition.
 *
 * Supabase sends a reset link like:
 *   https://yourapp.com/auth/reset-password#access_token=...&type=recovery
 *
 * With detectSessionInUrl: true, Supabase auto-exchanges the URL token for
 * a recovery session. We listen for PASSWORD_RECOVERY event, then call
 * supabase.auth.updateUser({ password }) to set the new password.
 */
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Lock, CheckCircle2 } from 'lucide-react';

import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';

const schema = z
  .object({
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ResetPasswordForm = z.infer<typeof schema>;

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false); // true once Supabase recovery session is active
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    // Supabase fires PASSWORD_RECOVERY when the recovery token in the URL is processed
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      }
    });

    // If we already have a session (e.g. page reload), allow the form
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    }).catch(() => null);

    // Cleanup subscription on unmount to prevent memory leaks
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: ResetPasswordForm) => {
    setServerError(null);
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      setServerError(error.message);
      return;
    }
    setSuccess(true);
    toast.success('Password reset successfully.');
    setTimeout(() => navigate('/auth/login', { replace: true }), 3000);
  };

  // No token in URL and no session
  if (!ready && !window.location.hash.includes('type=recovery')) {
    return (
      <AuthLayout>
        <Card>
          <CardHeader>
            <CardTitle>Invalid link</CardTitle>
            <CardDescription>This password reset link is missing or has expired.</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="error">Please request a new password reset link.</Alert>
            <div className="mt-4 text-center">
              <Link to="/auth/forgot-password" className="text-sm text-indigo-600 hover:underline">
                Request new link
              </Link>
            </div>
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  if (success) {
    return (
      <AuthLayout>
        <Card>
          <CardHeader>
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle>Password reset!</CardTitle>
            <CardDescription>
              Your password has been changed. Redirecting you to sign in…
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="lg" className="w-full" onClick={() => navigate('/auth/login')}>
              Sign in now
            </Button>
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle>Set new password</CardTitle>
          <CardDescription>Choose a strong password you haven't used before.</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            {serverError && (
              <Alert variant="error" onDismiss={() => setServerError(null)}>
                {serverError}
              </Alert>
            )}

            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              leftIcon={<Lock className="h-4 w-4" />}
              error={errors.password?.message}
              {...register('password')}
            />

            <Input
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              leftIcon={<Lock className="h-4 w-4" />}
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />

            <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
              Reset password
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
