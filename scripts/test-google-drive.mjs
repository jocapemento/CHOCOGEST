/**
 * Backup no Google Drive: consultas, erros e gravação/leitura com fetch simulado.
 */
import assert from 'node:assert/strict';
import {
  DriveRequestError,
  backupListQuery,
  buildMultipartRelated,
  clientIdFromUserInput,
  driveErrorMessage,
  escapeDriveQuery,
  folderListQuery,
  isGoogleClientId,
  loadBackupFromDrive,
  messageForGoogleAuthError,
  parseDriveFiles,
  pickNewestDriveFile,
  resolveGoogleClientId,
  saveBackupToDrive,
} from '../lib/google-drive.ts';

const CLIENT_ID = '123456789012-abcdefghi.apps.googleusercontent.com';

assert.equal(isGoogleClientId(CLIENT_ID), true);
assert.equal(isGoogleClientId(`  ${CLIENT_ID}  `), true);
assert.equal(isGoogleClientId('nao-e-um-id'), false);
assert.equal(isGoogleClientId(''), false);

assert.equal(clientIdFromUserInput(`cole aqui ${CLIENT_ID} obrigado`), CLIENT_ID);
assert.equal(
  clientIdFromUserInput(JSON.stringify({ web: { client_id: CLIENT_ID, client_secret: 'segredo' } })),
  CLIENT_ID
);
assert.equal(resolveGoogleClientId('qualquer-coisa', CLIENT_ID), CLIENT_ID);
assert.equal(resolveGoogleClientId(CLIENT_ID, ''), CLIENT_ID);
assert.equal(resolveGoogleClientId('errado', ''), '');

assert.equal(escapeDriveQuery("a'b\\c"), "a\\'b\\\\c");
assert.match(folderListQuery(), /chocogestRole/);
assert.match(folderListQuery(), /application\/vnd\.google-apps\.folder/);
assert.match(backupListQuery("id'1"), /id\\'1/);
assert.match(backupListQuery('pasta-1'), /'pasta-1' in parents/);

const files = parseDriveFiles({
  files: [
    { id: 'a', name: 'velho', modifiedTime: '2026-01-01T00:00:00.000Z' },
    { id: 'b', name: 'novo', modifiedTime: '2026-09-01T00:00:00.000Z' },
    { id: 3, name: 'invalido' },
    null,
  ],
});
assert.equal(files.length, 2);
assert.equal(pickNewestDriveFile(files)?.id, 'b');
assert.equal(pickNewestDriveFile([]), null);
assert.deepEqual(parseDriveFiles(null), []);

const boundary = 'limite';
const multipart = buildMultipartRelated({ name: 'chocogest-backup.json', parents: ['pasta'] }, '{"app":"ChocoGest"}', boundary);
assert.match(multipart, /"parents":\["pasta"\]/);
assert.match(multipart, /\r\n\{"app":"ChocoGest"\}\r\n/);
assert.match(multipart, /--limite--/);

assert.match(driveErrorMessage(401, '{}'), /sessão do Google expirou/);
assert.match(
  driveErrorMessage(403, JSON.stringify({ error: { message: 'Drive API has not been used' } })),
  /não está ativada/
);
assert.match(driveErrorMessage(403, '{}'), /usuário de teste/);
assert.match(driveErrorMessage(500, '{"error":{"message":"falha interna"}}'), /falha interna/);
assert.match(messageForGoogleAuthError('popup_failed_to_open'), /bloqueou a janela/);
assert.match(messageForGoogleAuthError('popup_closed'), /fechada/);

function createFakeDrive() {
  const state = {
    folders: [],
    files: [],
    content: '',
  };
  let seq = 1;

  async function fetchImpl(url, init = {}) {
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = init.headers ?? {};
    const auth = headers.Authorization ?? headers.authorization;
    if (auth !== 'Bearer ok') {
      return new Response(JSON.stringify({ error: { message: 'Invalid Credentials' } }), { status: 401 });
    }

    const address = new URL(url);
    if (method === 'GET' && address.pathname === '/drive/v3/files' && !address.searchParams.has('alt')) {
      const query = address.searchParams.get('q') ?? '';
      const listed = query.includes("value='folder'") ? state.folders : state.files;
      return Response.json({ files: listed });
    }

    if (method === 'POST' && address.pathname === '/drive/v3/files' && !address.searchParams.has('uploadType')) {
      const meta = JSON.parse(init.body);
      assert.equal(meta.name, 'ChocoGest');
      assert.equal(meta.mimeType, 'application/vnd.google-apps.folder');
      assert.equal(meta.appProperties.chocogestRole, 'folder');
      const created = {
        id: `folder-${seq++}`,
        name: meta.name,
        modifiedTime: '2026-09-25T10:00:00.000Z',
      };
      state.folders.push(created);
      return Response.json(created);
    }

    if (method === 'POST' && address.searchParams.get('uploadType') === 'multipart') {
      assert.match(String(init.body), /"chocogestRole":"backup"/);
      assert.match(String(init.body), /Backup inicial/);
      const created = {
        id: `file-${seq++}`,
        name: 'chocogest-backup.json',
        modifiedTime: '2026-09-25T11:00:00.000Z',
      };
      state.files.push(created);
      state.content = 'conteudo-inicial';
      return Response.json(created);
    }

    if (method === 'PATCH' && address.searchParams.get('uploadType') === 'media') {
      state.content = String(init.body);
      state.files[0] = {
        ...state.files[0],
        modifiedTime: '2026-09-25T12:00:00.000Z',
      };
      return Response.json(state.files[0]);
    }

    if (method === 'GET' && address.searchParams.get('alt') === 'media') {
      return new Response(state.content, { status: 200 });
    }

    return new Response('rota inesperada', { status: 500 });
  }

  return { state, fetchImpl };
}

const fake = createFakeDrive();
const created = await saveBackupToDrive('ok', '{"app":"ChocoGest","note":"Backup inicial"}', fake.fetchImpl);
assert.equal(created.name, 'chocogest-backup.json');
assert.equal(fake.state.folders.length, 1);
assert.equal(fake.state.files.length, 1);

const updated = await saveBackupToDrive('ok', '{"app":"ChocoGest","note":"Backup novo"}', fake.fetchImpl);
assert.equal(updated.modifiedTime, '2026-09-25T12:00:00.000Z');
assert.equal(fake.state.files.length, 1);
assert.equal(fake.state.content, '{"app":"ChocoGest","note":"Backup novo"}');

const loaded = await loadBackupFromDrive('ok', fake.fetchImpl);
assert.equal(loaded.content, fake.state.content);
assert.equal(loaded.file.id, updated.id);

const empty = createFakeDrive();
await assert.rejects(loadBackupFromDrive('ok', empty.fetchImpl), (error) => {
  assert.ok(error instanceof DriveRequestError);
  assert.match(error.message, /Nenhum backup/);
  return true;
});

await assert.rejects(saveBackupToDrive('ruim', '{}', fake.fetchImpl), (error) => {
  assert.ok(error instanceof DriveRequestError);
  assert.equal(error.status, 401);
  assert.match(error.message, /expirou/);
  return true;
});

console.log('backup no Google Drive ok');
