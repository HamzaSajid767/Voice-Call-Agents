/**
 * Run Husky only when it is installed (dev install). Skips cleanly for
 * `npm ci --omit=dev` / production installs.
 */
const { existsSync } = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
if (!existsSync(path.join(root, 'node_modules', 'husky'))) {
  process.exit(0);
}

execSync('husky', { stdio: 'inherit', cwd: root, shell: true });
