import { Link } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100">
        <Mail className="h-8 w-8 text-indigo-600" />
      </div>
      <h1 className="text-6xl font-bold text-slate-900">404</h1>
      <p className="mt-3 text-xl font-semibold text-slate-700">Page not found</p>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link to="/" className="mt-8">
        <Button size="lg">
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Button>
      </Link>
    </div>
  );
}
