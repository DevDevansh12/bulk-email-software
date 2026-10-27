/**
 * Application root.
 * Wraps with BrowserRouter, QueryClientProvider, and initializes auth session.
 */
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRoutes } from './routes/AppRoutes.js';
import { useAuthStore } from './features/auth/auth.store.js';
import { ToastContainer } from './components/ui/Toast.js';
import { useEffect } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

function SessionInit() {
  const initSession = useAuthStore((s) => s.initSession);
  useEffect(() => {
    void initSession();
  }, [initSession]);
  return null;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionInit />
        <AppRoutes />
        <ToastContainer />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
