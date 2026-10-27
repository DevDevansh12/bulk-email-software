import 'dotenv/config'; // Must be first — loads .env before any other module reads process.env
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { logger } from './lib/logger.js';
import { env } from './config/env.js';

const SHUTDOWN_TIMEOUT_MS = 30_000; // 30 seconds to finish in-flight requests

async function bootstrap(): Promise<void> {
  await connectDatabase();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV },
      `Server listening on port ${env.PORT}`
    );
  });

  let cronInterval: NodeJS.Timeout | undefined;

  // Start local cron runner for scheduled campaigns in development
  if (env.NODE_ENV === 'development') {
    const { processScheduledCampaigns } = await import('./features/campaigns/campaigns.service.js');
    logger.info('Starting local cron runner for scheduled campaigns (runs every 30s)...');
    
    cronInterval = setInterval(async () => {
      try {
        const outcome = await processScheduledCampaigns();
        if (outcome.processed > 0) {
          logger.info({ processed: outcome.processed }, 'Local Cron: processed due scheduled campaigns');
        }
      } catch (err) {
        logger.error({ err }, 'Local Cron: failed to process scheduled campaigns');
      }
    }, 30_000);
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutdown signal received');
    if (cronInterval) {
      clearInterval(cronInterval);
    }

    server.close(async (err) => {
      if (err) {
        logger.error({ err }, 'Error during server close');
        process.exit(1);
      }

      try {
        await disconnectDatabase();
        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (shutdownErr) {
        logger.error({ err: shutdownErr }, 'Error during graceful shutdown');
        process.exit(1);
      }
    });
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason, promise) => {
    logger.fatal({ 
      reason: reason instanceof Error ? {
        name: reason.name,
        message: reason.message,
        stack: reason.stack,
      } : reason,
      promise: String(promise)
    }, 'Unhandled promise rejection — shutting down');
    void shutdown('unhandledRejection');
  });

  process.on('uncaughtException', (err) => {
    logger.fatal({ 
      err: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      }
    }, 'Uncaught exception — shutting down');
    void shutdown('uncaughtException');
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
