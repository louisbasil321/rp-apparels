// instrumentation-client.ts or layout.tsx
const protectedRoutes = [
  { path: '/', method: 'POST' },        // CRITICAL: Covers actions on home page
  { path: '/:path*', method: 'POST' }, 
  {path: '/shop', method: 'POST'} // Covers all other routes
];