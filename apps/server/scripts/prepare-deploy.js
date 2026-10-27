/**
 * Deployment preparation script
 * 
 * This script ensures the public/ directory is included in the dist/ output
 * for hosting platforms that only deploy the output directory.
 */
import { cp } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PUBLIC_SRC = resolve(__dirname, '../public');
const PUBLIC_DEST = resolve(__dirname, '../dist/public');

async function copyPublicToDist() {
  console.log('📦 Preparing deployment: copying public/ to dist/public...');

  try {
    if (!existsSync(PUBLIC_SRC)) {
      console.error('❌ Error: public/ directory not found!');
      console.error(`   Expected at: ${PUBLIC_SRC}`);
      console.error('   Run "npm run build" first to generate the React build.');
      process.exit(1);
    }

    // Copy public/ to dist/public/
    await cp(PUBLIC_SRC, PUBLIC_DEST, { recursive: true });

    console.log('✅ Deployment ready!');
    console.log(`   From: ${PUBLIC_SRC}`);
    console.log(`   To:   ${PUBLIC_DEST}`);
  } catch (error) {
    console.error('❌ Failed to prepare deployment:', error.message);
    process.exit(1);
  }
}

copyPublicToDist();
