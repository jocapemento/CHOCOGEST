import { execSync } from 'node:child_process';

process.env.GITHUB_PAGES = 'true';

console.log('1/2 ESLint...');
execSync('npm run lint', { stdio: 'inherit' });

console.log('2/2 Build GitHub Pages...');
execSync('npm run build:pages', { stdio: 'inherit', env: process.env });

console.log('\n✓ Tudo OK — pode fazer git push');