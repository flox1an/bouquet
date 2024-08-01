import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { NDKContextProvider } from './utils/ndk.tsx';
import { Navigate, Route, RouterProvider, createBrowserRouter, createRoutesFromElements } from 'react-router-dom';
import { Layout } from './components/Layout/Layout.tsx';
import Home from './pages/Home.tsx';
import { Transfer } from './pages/Transfer.tsx';
import Upload from './pages/Upload.tsx';
import Check from './pages/Check.tsx';

import { pdfjs } from 'react-pdf';
import { GlobalProvider } from './GlobalState.tsx';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString();

/**
 * Creates an Indexed DB persister
 * @see https://react-query.tanstack.com/plugins/persistQueryClient#building-a-persistor
 * @see https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
 */
/*
export function createIDBPersister(idbValidKey: IDBValidKey = 'reactQuery') {
  return {
    persistClient: async (client: PersistedClient) => {
      set(idbValidKey, client);
    },
    restoreClient: async () => {
      return await get<PersistedClient>(idbValidKey);
    },
    removeClient: async () => {
      await del(idbValidKey);
    },
  } as Persister;
}
*/

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

// nst persister = createIDBPersister();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* 
    <PersistQueryClientProvider
      persistOptions={{
        persister,
        dehydrateOptions: {
          shouldDehydrateQuery: () => true, //query.state.status === 'success',
        },
        hydrateOptions: {
          shouldhHhydrateQuery: () => true,
        },
      }}
      client={queryClient}
    >*/}
    <QueryClientProvider client={queryClient}>
      <NDKContextProvider>
        <GlobalProvider>
          <RouterProvider router={router} />
        </GlobalProvider>
      </NDKContextProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>
);
