import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NostrProvider } from './utils/nostr.tsx';
import { Navigate, Route, RouterProvider, createBrowserRouter, createRoutesFromElements } from 'react-router-dom';
import { Layout } from './components/Layout/Layout.tsx';
import Home from './pages/Home.tsx';
import { Transfer } from './pages/Transfer.tsx';
import Upload from './pages/Upload.tsx';
import Check from './pages/Check.tsx';
import { GlobalProvider } from './GlobalState.tsx';

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<Layout />}>
      <Route path="/" element={<Navigate to="/upload" replace />} />
      <Route path="/browse" element={<Home />} />
      <Route path="/transfer/:source" element={<Transfer />} />
      <Route path="/sync" element={<Transfer />} />
      <Route path="/upload" element={<Upload />} />
      <Route path="/check/:source" element={<Check />} />
    </Route>
  )
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
    },
  },
});

const ReactQueryDevtools = import.meta.env.DEV
  ? React.lazy(() =>
      import('@tanstack/react-query-devtools').then(module => ({ default: module.ReactQueryDevtools }))
    )
  : null;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <NostrProvider>
        <GlobalProvider>
          <RouterProvider router={router} />
        </GlobalProvider>
      </NostrProvider>
      {ReactQueryDevtools && (
        <React.Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} />
        </React.Suspense>
      )}
    </QueryClientProvider>
  </React.StrictMode>
);
