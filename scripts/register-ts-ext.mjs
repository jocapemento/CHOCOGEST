/**
 * Permite que um teste Node importe .ts com caminhos relativos sem extensão,
 * no mesmo estilo de scripts/test-google-drive.mjs, e resolva o alias `@/`.
 */
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const projeto = join(dirname(fileURLToPath(import.meta.url)), '..');

const hook = `
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const PROJETO = ${JSON.stringify(projeto)};

function comExtensaoTs(specifier) {
  return /\\.(?:[cm]?[jt]s|json)$/.test(specifier);
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const relativo = specifier.slice(2);
    const arquivo = join(PROJETO, comExtensaoTs(relativo) ? relativo : relativo + '.ts');
    if (existsSync(arquivo)) return nextResolve(pathToFileURL(arquivo).href, context);
  }

  const relativo = specifier.startsWith('./') || specifier.startsWith('../');
  if (relativo && !comExtensaoTs(specifier) && context.parentURL) {
    const candidate = join(dirname(fileURLToPath(context.parentURL)), specifier + '.ts');
    if (existsSync(candidate)) return nextResolve(specifier + '.ts', context);
  }
  return nextResolve(specifier, context);
}
`;

register('data:text/javascript,' + encodeURIComponent(hook), import.meta.url);
