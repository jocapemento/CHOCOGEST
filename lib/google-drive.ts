/**
 * Backup no Google Drive a partir do site estático.
 * O Client ID OAuth é público; o token de acesso fica só na memória da aba.
 */

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const DRIVE_BACKUP_NAME = 'chocogest-backup.json';
export const DRIVE_FOLDER_NAME = 'ChocoGest';
export const GOOGLE_CLIENT_ID_STORAGE_KEY = 'chocogest_google_client_id';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ROLE_KEY = 'chocogestRole';
const CLIENT_ID_PATTERN = /[0-9]+-[0-9a-z_-]+\.apps\.googleusercontent\.com/i;

export type DriveFile = {
  id: string;
  name: string;
  modifiedTime?: string;
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class DriveRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'DriveRequestError';
    this.status = status;
  }
}

export function isGoogleClientId(value: string): boolean {
  return new RegExp(`^${CLIENT_ID_PATTERN.source}$`, 'i').test(value.trim());
}

/** Aceita o ID puro ou um JSON de credencial, e guarda só o client_id. */
export function clientIdFromUserInput(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as {
        client_id?: unknown;
        web?: { client_id?: unknown };
        installed?: { client_id?: unknown };
      };
      const embedded = parsed.web?.client_id ?? parsed.installed?.client_id ?? parsed.client_id;
      if (typeof embedded === 'string' && isGoogleClientId(embedded)) return embedded.trim();
    } catch {
      /* texto solto abaixo */
    }
  }
  const match = trimmed.match(CLIENT_ID_PATTERN);
  return match ? match[0] : trimmed;
}

export function resolveGoogleClientId(
  stored: string | null | undefined,
  envValue = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
): string {
  const fromEnv = (envValue ?? '').trim();
  if (isGoogleClientId(fromEnv)) return fromEnv;
  const local = (stored ?? '').trim();
  return isGoogleClientId(local) ? local : '';
}

export function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function folderListQuery(): string {
  return [
    `mimeType = '${FOLDER_MIME}'`,
    'trashed = false',
    `appProperties has { key='${ROLE_KEY}' and value='folder' }`,
  ].join(' and ');
}

export function backupListQuery(folderId: string): string {
  return [
    'trashed = false',
    `appProperties has { key='${ROLE_KEY}' and value='backup' }`,
    `'${escapeDriveQuery(folderId)}' in parents`,
  ].join(' and ');
}

export function parseDriveFiles(payload: unknown): DriveFile[] {
  if (!payload || typeof payload !== 'object') return [];
  const files = (payload as { files?: unknown }).files;
  if (!Array.isArray(files)) return [];
  return files.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as { id?: unknown; name?: unknown; modifiedTime?: unknown };
    if (typeof row.id !== 'string' || typeof row.name !== 'string') return [];
    return [
      {
        id: row.id,
        name: row.name,
        modifiedTime: typeof row.modifiedTime === 'string' ? row.modifiedTime : undefined,
      },
    ];
  });
}

export function pickNewestDriveFile(files: DriveFile[]): DriveFile | null {
  if (files.length === 0) return null;
  return [...files].sort((a, b) => (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? ''))[0] ?? null;
}

export function buildMultipartRelated(
  meta: Record<string, unknown>,
  content: string,
  boundary: string
): string {
  return [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(meta),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    content,
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

export function driveErrorMessage(status: number, body: string): string {
  let apiMessage = '';
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (typeof parsed?.error?.message === 'string') apiMessage = parsed.error.message;
  } catch {
    apiMessage = '';
  }

  if (status === 401) return 'A sessão do Google expirou. Toque de novo para autorizar.';
  if (status === 403) {
    if (/accessNotConfigured|has not been used|is disabled/i.test(`${apiMessage}\n${body}`)) {
      return 'A API Google Drive não está ativada neste projeto do Google Cloud.';
    }
    return 'O Google recusou o acesso ao Drive. Ative a API Google Drive e inclua seu e-mail como usuário de teste.';
  }
  if (status === 404) return 'O backup no Drive não foi encontrado.';
  if (apiMessage) return `O Google Drive recusou o pedido: ${apiMessage}`;
  return `O Google Drive respondeu com erro ${status}.`;
}

export function messageForGoogleAuthError(code: string | undefined): string {
  switch (code) {
    case 'popup_failed_to_open':
      return 'O navegador bloqueou a janela do Google. Permita pop-ups deste site e toque de novo.';
    case 'popup_closed':
      return 'A janela do Google foi fechada antes da autorização.';
    case 'access_denied':
      return 'O acesso ao Google Drive não foi autorizado.';
    case 'interaction_required':
      return 'É preciso entrar na conta Google. Toque de novo para autorizar.';
    default:
      return 'Não foi possível autorizar o Google Drive.';
  }
}

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
};

type TokenClientConfig = {
  client_id: string;
  scope: string;
  callback: (response: TokenResponse) => void;
  error_callback?: (error: { type?: string; message?: string }) => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: TokenClientConfig) => {
            requestAccessToken: (override?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

let gisPromise: Promise<void> | null = null;
let cachedToken: { token: string; clientId: string; expiresAt: number } | null = null;

export function clearDriveAccessToken(): void {
  cachedToken = null;
}

export function loadGoogleIdentity(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('O login do Google só funciona no navegador.'));
  }
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;

  gisPromise = new Promise((resolve, reject) => {
    const finishOk = () => {
      if (window.google?.accounts?.oauth2) resolve();
      else {
        gisPromise = null;
        reject(new Error('Não foi possível carregar o login do Google.'));
      }
    };
    const finishErr = () => {
      gisPromise = null;
      reject(new Error('Não foi possível carregar o login do Google. Verifique a internet.'));
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-chocogest-gis="1"]');
    if (existing) {
      existing.addEventListener('load', finishOk, { once: true });
      existing.addEventListener('error', finishErr, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.dataset.chocogestGis = '1';
    script.onload = finishOk;
    script.onerror = finishErr;
    document.head.appendChild(script);
  });

  return gisPromise;
}

export function requestDriveAccessToken(
  clientId: string,
  options?: { forceConsent?: boolean }
): Promise<string> {
  if (
    !options?.forceConsent &&
    cachedToken &&
    cachedToken.clientId === clientId &&
    cachedToken.expiresAt > Date.now() + 60_000
  ) {
    return Promise.resolve(cachedToken.token);
  }

  return loadGoogleIdentity().then(
    () =>
      new Promise((resolve, reject) => {
        const oauth = window.google?.accounts?.oauth2;
        if (!oauth) {
          reject(new Error('Não foi possível carregar o login do Google.'));
          return;
        }

        let settled = false;
        const settle = (run: () => void) => {
          if (settled) return;
          settled = true;
          run();
        };

        const client = oauth.initTokenClient({
          client_id: clientId,
          scope: DRIVE_FILE_SCOPE,
          callback: (response) => {
            if (response.error || !response.access_token) {
              settle(() => reject(new Error(messageForGoogleAuthError(response.error))));
              return;
            }
            const seconds = typeof response.expires_in === 'number' ? response.expires_in : 3600;
            cachedToken = {
              token: response.access_token,
              clientId,
              expiresAt: Date.now() + seconds * 1000,
            };
            settle(() => resolve(response.access_token as string));
          },
          error_callback: (error) => {
            settle(() => reject(new Error(messageForGoogleAuthError(error?.type))));
          },
        });

        try {
          client.requestAccessToken({ prompt: options?.forceConsent ? 'consent' : '' });
        } catch (error) {
          settle(() =>
            reject(error instanceof Error ? error : new Error('Não foi possível autorizar o Google Drive.'))
          );
        }
      })
  );
}

async function driveText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

async function throwIfFailed(res: Response): Promise<string> {
  const body = await driveText(res);
  if (!res.ok) throw new DriveRequestError(driveErrorMessage(res.status, body), res.status);
  return body;
}

function parseFilePayload(body: string, status: number): DriveFile {
  try {
    const file = parseDriveFiles({ files: [JSON.parse(body)] })[0];
    if (file) return file;
  } catch {
    /* mensagem abaixo */
  }
  throw new DriveRequestError('O Google Drive devolveu uma resposta inválida.', status);
}

async function listFiles(token: string, query: string, fetchImpl: FetchLike): Promise<DriveFile[]> {
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', query);
  url.searchParams.set('spaces', 'drive');
  url.searchParams.set('fields', 'files(id,name,modifiedTime)');
  url.searchParams.set('pageSize', '10');
  url.searchParams.set('orderBy', 'modifiedTime desc');

  const res = await fetchImpl(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await throwIfFailed(res);
  try {
    return parseDriveFiles(JSON.parse(body));
  } catch {
    throw new DriveRequestError('O Google Drive devolveu uma resposta inválida.', res.status);
  }
}

async function ensureFolder(token: string, fetchImpl: FetchLike): Promise<DriveFile> {
  const existing = pickNewestDriveFile(await listFiles(token, folderListQuery(), fetchImpl));
  if (existing) return existing;

  const res = await fetchImpl('https://www.googleapis.com/drive/v3/files?fields=id,name,modifiedTime', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: DRIVE_FOLDER_NAME,
      mimeType: FOLDER_MIME,
      appProperties: { [ROLE_KEY]: 'folder' },
    }),
  });
  return parseFilePayload(await throwIfFailed(res), res.status);
}

export async function saveBackupToDrive(
  token: string,
  content: string,
  fetchImpl: FetchLike = fetch
): Promise<DriveFile> {
  const folder = await ensureFolder(token, fetchImpl);
  const existing = pickNewestDriveFile(await listFiles(token, backupListQuery(folder.id), fetchImpl));

  if (existing) {
    const res = await fetchImpl(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existing.id)}?uploadType=media&fields=id,name,modifiedTime`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: content,
      }
    );
    return parseFilePayload(await throwIfFailed(res), res.status);
  }

  const boundary = `chocogest${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const meta = {
    name: DRIVE_BACKUP_NAME,
    mimeType: 'application/json',
    parents: [folder.id],
    appProperties: { [ROLE_KEY]: 'backup' },
  };
  const res = await fetchImpl(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: buildMultipartRelated(meta, content, boundary),
    }
  );
  return parseFilePayload(await throwIfFailed(res), res.status);
}

export async function loadBackupFromDrive(
  token: string,
  fetchImpl: FetchLike = fetch
): Promise<{ content: string; file: DriveFile }> {
  const folder = pickNewestDriveFile(await listFiles(token, folderListQuery(), fetchImpl));
  if (!folder) {
    throw new DriveRequestError('Nenhum backup do ChocoGest foi encontrado neste Google Drive.', 404);
  }
  const file = pickNewestDriveFile(await listFiles(token, backupListQuery(folder.id), fetchImpl));
  if (!file) {
    throw new DriveRequestError('Nenhum backup do ChocoGest foi encontrado neste Google Drive.', 404);
  }

  const res = await fetchImpl(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const content = await throwIfFailed(res);
  return { content, file };
}
