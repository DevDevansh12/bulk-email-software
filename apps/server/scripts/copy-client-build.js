/**
 * Post-build script: Copy React build to server/public
 *
 * This script runs automatically after the server build completes.
 * It copies the entire React application from apps/client/dist to apps/server/public
 * so the Express server can serve the frontend from the same domain.
 *
 * Why a separate script:
 * - Clean separation of concerns
 * - Can be run independently for debugging
 * - Works with npm's postbuild hook
 * - Pure Node.js — no external dependencies
 */
import { cp, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CLIENT_DIST = resolve(__dirname, '../../client/dist');
const SERVER_PUBLIC = resolve(__dirname, '../public');

async function copyClientBuild() {
  console.log('📦 Copying React build to server/public...');

  try {
    // Verify client build exists
    if (!existsSync(CLIENT_DIST)) {
      throw new Error(
        `Client build not found at ${CLIENT_DIST}. Run "npm run build --workspace=apps/client" first.`
      );
    }

    // Remove old public directory if it exists
    if (existsSync(SERVER_PUBLIC)) {
      console.log('🗑️  Removing old public directory...');
      await rm(SERVER_PUBLIC, { recursive: true, force: true });
    }

    // Create fresh public directory
    await mkdir(SERVER_PUBLIC, { recursive: true });

    // Copy all files from client/dist to server/public
    await cp(CLIENT_DIST, SERVER_PUBLIC, { recursive: true });

    console.log('✅ Client build copied successfully!');
    console.log(`   From: ${CLIENT_DIST}`);
    console.log(`   To:   ${SERVER_PUBLIC}`);
  } catch (error) {
    console.error('❌ Failed to copy client build:', error.message);
    process.exit(1);
  }
}

copyClientBuild();
