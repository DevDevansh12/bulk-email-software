/**
 * Static file serving middleware for React application.
 *
 * This middleware serves the React build from the /public directory
 * and handles React Router by falling back to index.html for non-API routes.
 *
 * Key behaviors:
 * 1. Serve static assets (JS, CSS, images) with proper cache headers
 * 2. Don't interfere with API routes (/api/*)
 * 3. Don't interfere with health check (/health)
 * 4. Serve index.html for all other routes (React Router catch-all)
 * 5. Use ESM-compatible path resolution
 *
 * Production optimizations:
 * - Long cache for immutable assets (hashed files)
 * - No cache for index.html (ensures users get latest version)
 * - Compression handled by compression middleware
 */
import express, { type Request, type Response, type NextFunction } from 'express';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { logger } from '../lib/logger.js';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve path to public directory (built React app)
// The public directory can be in several locations depending on deployment:
// 1. Development/Full deploy: process.cwd()/public (apps/server/public)
// 2. Dist-only deploy: process.cwd()/dist/public (apps/server/dist/public)
// 3. Started from the repo root (e.g. Hostinger Node.js apps): resolved from this
//    file's location instead of cwd — compiled: dist/apps/server/src/middleware → dist/public,
//    tsx: src/middleware → public
const PUBLIC_DIR_PRIMARY = join(process.cwd(), 'public');
const PUBLIC_DIR_FALLBACK = join(process.cwd(), 'dist', 'public');
const PUBLIC_DIR_CANDIDATES = [
  PUBLIC_DIR_PRIMARY,
  PUBLIC_DIR_FALLBACK,
  resolve(__dirname, '../../../../public'),
  resolve(__dirname, '../../public'),
];

// Use the first one that contains index.html (falls back to primary so errors name a path)
const PUBLIC_DIR =
  PUBLIC_DIR_CANDIDATES.find((dir) => existsSync(join(dir, 'index.html'))) ?? PUBLIC_DIR_PRIMARY;
const INDEX_HTML = join(PUBLIC_DIR, 'index.html');

// Log path diagnostics at module load time
logger.info({
  cwd: process.cwd(),
  dirname: __dirname,
  filename: __filename,
  publicDirCandidates: PUBLIC_DIR_CANDIDATES,
  publicDirUsing: PUBLIC_DIR,
  indexHtml: INDEX_HTML,
  indexExists: existsSync(INDEX_HTML),
}, 'Static middleware paths initialized');

/**
 * Check if the public directory exists.
 * In development, this might not exist until the client is built.
 */
function isPublicDirAvailable(): boolean {
  const publicExists = existsSync(PUBLIC_DIR);
  const indexExists = existsSync(INDEX_HTML);
  
  // Log diagnostics for troubleshooting production issues
  logger.debug({
    publicDir: PUBLIC_DIR,
    indexHtml: INDEX_HTML,
    publicExists,
    indexExists,
    cwd: process.cwd(),
    dirname: __dirname,
    filename: __filename,
  }, 'Static file directory check');
  
  return publicExists && indexExists;
}

/**
 * Middleware to serve static files from the React build.
 *
 * Usage:
 * ```ts
 * app.use(serveStaticFiles());
 * ```
 */
export function serveStaticFiles() {
  // Check if public directory exists
  const isAvailable = isPublicDirAvailable();
  
  if (!isAvailable) {
    logger.error(
      { 
        publicDir: PUBLIC_DIR,
        indexHtml: INDEX_HTML,
        cwd: process.cwd(),
      },
      'CRITICAL: Public directory not found in production. React build is missing!'
    );

    // In production, this is a critical error
    if (process.env['NODE_ENV'] === 'production') {
      throw new Error(
        `Production build error: React build not found at ${PUBLIC_DIR}. ` +
        `Ensure 'npm run build' completed successfully and apps/server/public/ exists.`
      );
    }

    // In development, just warn and return no-op middleware
    logger.warn(
      { publicDir: PUBLIC_DIR },
      'Public directory not found. Run "npm run build" to generate the React build.'
    );
    return (req: Request, res: Response, next: NextFunction) => next();
  }

  logger.info({ publicDir: PUBLIC_DIR }, 'Static file serving enabled');

  // Configure static file serving with cache options
  const staticOptions: Parameters<typeof express.static>[1] = {
    // Don't set etag header (use cache control instead for clarity)
    etag: false,
    // Custom cache control
    setHeaders: (res: Response, path: string) => {
      // Immutable assets (with hash in filename) — cache for 1 year
      if (path.match(/\.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|webp|ico)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
      // index.html — never cache (always fetch fresh)
      else if (path.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    },
  };

  // Serve static files from public directory
  const staticMiddleware = express.static(PUBLIC_DIR, staticOptions);

  return staticMiddleware;
}

/**
 * Catch-all middleware to serve index.html for non-API routes.
 *
 * This enables client-side routing (React Router) to work correctly.
 * When a user navigates directly to /dashboard or refreshes the page,
 * the server serves index.html, and React Router takes over.
 *
 * Usage (must be registered AFTER all API routes):
 * ```ts
 * app.use(serveSpaFallback());
 * ```
 */
export function serveSpaFallback() {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip if:
    // 1. Request is for API routes
    // 2. Request is for health check
    // 3. Public directory doesn't exist
    // 4. Request already has a response (handled by previous middleware)
    // 5. Request is for a file with extension (static asset already handled)
    const isApiRoute = req.path.startsWith('/api/');
    const isHealthCheck = req.path.startsWith('/health');
    const hasExtension = /\.[a-zA-Z0-9]+$/.test(req.path);
    const isPublicAvailable = isPublicDirAvailable();
    
    if (
      isApiRoute ||
      isHealthCheck ||
      hasExtension ||
      !isPublicAvailable ||
      res.headersSent
    ) {
      return next();
    }

    // Serve index.html for all other routes (React Router catch-all)
    res.sendFile(INDEX_HTML, (err) => {
      if (err) {
        logger.error({ 
          err: {
            name: err.name,
            message: err.message,
            stack: err.stack,
            code: (err as NodeJS.ErrnoException).code,
          },
          path: req.path,
          indexHtml: INDEX_HTML,
          publicDir: PUBLIC_DIR,
          publicExists: existsSync(PUBLIC_DIR),
          indexExists: existsSync(INDEX_HTML),
          cwd: process.cwd(),
        }, 'Failed to send index.html - detailed diagnostics');
        next(err);
      }
    });
  };
}
