/**
 * Permite que um teste Node importe .ts com caminhos relativos sem extensão,
 * no mesmo estilo de scripts/test-google-drive.mjs.
 */
import { register } from 'node:module';

const hook = `
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export async function resolve(specifier, context, nextResolve) {
  const relativo = specifier.startsWith('./') || specifier.startsWith('../');
  const semExtensao = !/\\.(?:[cm]?[jt]s|json)$/.test(specifier);
  if (relativo && semExtensao && context.parentURL) {
    const candidate = join(dirname(fileURLToPath(context.parentURL)), specifier + '.ts');
    if (existsSync(candidate)) return nextResolve(specifier + '.ts', context);
  }
  return nextResolve(specifier, context);
}
`;

register('data:text/javascript,' + encodeURIComponent(hook), import.meta.url);
