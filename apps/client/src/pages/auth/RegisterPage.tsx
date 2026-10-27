import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, User } from 'lucide-react';

import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { authApi } from '@/features/auth/auth.api';
import { useAuthStore } from '@/features/auth/auth.store';
import { toast } from '@/components/ui/Toast';

const passwordRules = z
  .string()
  .min(1, 'Password is required');

const registerSchema = z
  .object({
    firstName: z.string().min(1, 'First name is required').max(50),
    lastName: z.string().min(1, 'Last name is required').max(50),
    email: z.string().min(1, 'Email is required').email('Enter a valid email'),
    password: passwordRules,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (values: RegisterForm) => {
    // Prevent multiple simultaneous registration attempts
    if (isRegistering) return;
    
    setIsRegistering(true);
    setServerError(null);
    
    try {
      const result = await authApi.register({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
      });

      // Directly log in the user after registration (email is auto-confirmed)
      setAuth(result.user, result.accessToken);
      toast.success(`Account created! Welcome, ${result.user.firstName}.`);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      setServerError(message);
    } finally {
      setIsRegistering(false);
    }
  };

  // Disable form submission if already registering
  const isFormDisabled = isSubmitting || isRegistering;

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>Start sending campaigns in minutes. No credit card required.</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            {serverError && (
              <Alert variant="error" onDismiss={() => setServerError(null)}>
                {serverError}
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="First name"
                autoComplete="given-name"
                placeholder="Jane"
                leftIcon={<User className="h-4 w-4" />}
                error={errors.firstName?.message}
                disabled={isFormDisabled}
                {...register('firstName')}
              />
              <Input
                label="Last name"
                autoComplete="family-name"
                placeholder="Doe"
                error={errors.lastName?.message}
                disabled={isFormDisabled}
                {...register('lastName')}
              />
            </div>

            <Input
              label="Work email"
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
              autoComplete="new-password"
              placeholder="••••••••"
              leftIcon={<Lock className="h-4 w-4" />}
              error={errors.password?.message}
              disabled={isFormDisabled}
              {...register('password')}
            />

            <Input
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              leftIcon={<Lock className="h-4 w-4" />}
              error={errors.confirmPassword?.message}
              disabled={isFormDisabled}
              {...register('confirmPassword')}
            />

            <Button type="submit" size="lg" className="w-full" loading={isFormDisabled} disabled={isFormDisabled}>
              Create account
            </Button>

            <p className="text-center text-xs text-slate-500">
              By creating an account, you agree to our{' '}
              <Link to="/terms" className="underline hover:text-slate-800">Terms</Link>{' '}
              and{' '}
              <Link to="/privacy" className="underline hover:text-slate-800">Privacy Policy</Link>.
            </p>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            Already have an account?{' '}
            <Link to="/auth/login" className="font-medium text-indigo-600 hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
