import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, ArrowLeft } from 'lucide-react';

import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { authApi } from '@/features/auth/auth.api';

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
});

type ForgotPasswordForm = z.infer<typeof schema>;

export function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: ForgotPasswordForm) => {
    setServerError(null);
    try {
      await authApi.forgotPassword({ email: values.email });
      setSubmitted(true);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  if (submitted) {
    return (
      <AuthLayout>
        <Card>
          <CardHeader>
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <Mail className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle>Check your inbox</CardTitle>
            <CardDescription>
              If an account exists for{' '}
              <span className="font-medium text-slate-800">{getValues('email')}</span>,
              we've sent a password reset link.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="info">
              The link expires in <strong>1 hour</strong>. Check your spam folder if you don't see it.
            </Alert>
            <Button
              variant="secondary"
              size="lg"
              className="w-full"
              onClick={() => setSubmitted(false)}
            >
              Resend link
            </Button>
            <div className="text-center">
              <Link
                to="/auth/login"
                className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:underline"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>
            Enter your email and we'll send you a reset link.
          </CardDescription>
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
              {...register('email')}
            />

            <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
              Send reset link
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link
              to="/auth/login"
              className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
