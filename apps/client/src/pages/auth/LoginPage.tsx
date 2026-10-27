import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock } from 'lucide-react';

import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { authApi } from '@/features/auth/auth.api';
import { useAuthStore } from '@/features/auth/auth.store';
import { toast } from '@/components/ui/Toast';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const from = (location.state as { from?: string })?.from ?? '/dashboard';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (values: LoginForm) => {
    // Prevent multiple simultaneous login attempts
    if (isLoggingIn) return;
    
    setIsLoggingIn(true);
    setServerError(null);
    
    try {
      const result = await authApi.login(values);
      setAuth(result.user, result.accessToken);
      toast.success(`Welcome back, ${result.user.firstName}!`);
      navigate(from, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed. Please try again.';
      setServerError(message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Disable form submission if already logging in
  const isFormDisabled = isSubmitting || isLoggingIn;

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle>Sign in to MailFlow</CardTitle>
          <CardDescription>Welcome back! Enter your credentials to continue.</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            {serverError && (
              <Alert variant="error" onDismiss={() => setServerError(null)}>
                {serverError}
              </Alert>
            )}

            <Input
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              leftIcon={<Mail className="h-4 w-4" />}
              error={errors.email?.message}
              disabled={isFormDisabled}
              {...register('email')}
            />

            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              leftIcon={<Lock className="h-4 w-4" />}
              error={errors.password?.message}
              disabled={isFormDisabled}
              {...register('password')}
            />

            <div className="flex items-center justify-end">
              <Link
                to="/auth/forgot-password"
                className="text-sm text-indigo-600 hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            <Button type="submit" size="lg" className="w-full" loading={isFormDisabled} disabled={isFormDisabled}>
              Sign in
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            Don't have an account?{' '}
            <Link to="/auth/register" className="font-medium text-indigo-600 hover:underline">
              Create one
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
