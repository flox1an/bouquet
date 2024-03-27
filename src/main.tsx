import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { NDKContextProvider } from './ndk.tsx';
import { Route, RouterProvider, createBrowserRouter, createRoutesFromElements } from 'react-router-dom';
import { Layout } from './components/Layout/Layout.tsx';
import Home from './pages/Home.tsx';
import { Transfer } from './pages/Transfer.tsx';
import Upload from './pages/Upload.tsx';
import Check from './pages/Check.tsx';

const queryClient = new QueryClient();

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<Layout />}>
      <Route path="/" element={<Home />} />
      <Route path="/transfer/:source" element={<Transfer />} />
      <Route path="/upload" element={<Upload/>} />
      <Route path="/check/:source" element={<Check/>} />
    </Route>
  )
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <NDKContextProvider>
        <RouterProvider router={router} />
      </NDKContextProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>
);
