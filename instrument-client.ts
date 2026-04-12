// instrumentation-client.ts
import { initBotId } from 'botid/client/core';

initBotId({
  protect: [
    { path: '/', method: 'POST' },       // Protects Server Actions on the home page
    { path: '/*', method: 'POST' },      // Protects first-level routes (e.g., /checkout)
    { path: '/**', method: 'POST' },     // Protects deeply nested routes (e.g., /products/123)
  ],
});