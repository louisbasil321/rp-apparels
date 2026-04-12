// instrumentation-client.ts
import { initBotId } from 'botid/client/core';

initBotId({
  protect: [
    // This targets your Server Actions across the app
    { path: '/*', method: 'POST' }, 
  ],
});