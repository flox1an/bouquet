import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NostrProvider } from './utils/nostr.tsx';
import {
  Navigate,
  Route,
  RouterProvider,
  createBrowserRouter,
  createRoutesFromElements,
  useParams,
} from 'react-router-dom';
import { Layout } from './components/Layout/Layout.tsx';
import { GlobalProvider } from './GlobalState.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PasswordPromptProvider } from './components/PasswordPromptProvider';

const Transfer = React.lazy(() => import('./pages/Transfer.tsx').then(m => ({ default: m.Transfer })));
const Upload = React.lazy(() => import('./pages/Upload.tsx'));
const Timeline = React.lazy(() => import('./pages/Timeline.tsx'));
const TimelineAssetDetail = React.lazy(() => import('./pages/TimelineAssetDetail.tsx'));

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<Layout />}>
      <Route path="/" element={<Navigate to="/upload" replace />} />
      <Route path="/browse" element={<Timeline />} />
      <Route path="/browse/:assetId" element={<TimelineAssetDetail />} />
      <Route path="/transfer/:source" element={<Transfer />} />
      <Route path="/sync" element={<Transfer />} />
      <Route path="/upload" element={<Upload />} />
      <Route path="/timeline" element={<Navigate to="/browse" replace />} />
      <Route path="/timeline/:assetId" element={<RedirectToBrowseAsset />} />
    </Route>
  )
);

function RedirectToBrowseAsset() {
  const { assetId } = useParams<{ assetId: string }>();
  return <Navigate to={`/browse/${assetId}`} replace />;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
    },
  },
});

const ReactQueryDevtools = import.meta.env.DEV
  ? React.lazy(() => import('@tanstack/react-query-devtools').then(module => ({ default: module.ReactQueryDevtools })))
  : null;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <PasswordPromptProvider>
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
      </PasswordPromptProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
