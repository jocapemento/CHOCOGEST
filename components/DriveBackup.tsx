'use client';

import React, { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AppData } from '@/lib/types';
import {
  DRIVE_BACKUP_NAME,
  DRIVE_FOLDER_NAME,
  DriveRequestError,
  GOOGLE_CLIENT_ID_STORAGE_KEY,
  clearDriveAccessToken,
  clientIdFromUserInput,
  isGoogleClientId,
  loadBackupFromDrive,
  loadGoogleIdentity,
  requestDriveAccessToken,
  resolveGoogleClientId,
  saveBackupToDrive,
} from '@/lib/google-drive';
import { parseBackupFile, serializeBackup } from '@/lib/storage';

const ORIGIN_PUBLICA = 'https://jocapemento.github.io';
const ORIGIN_LOCAL = 'http://localhost:3000';

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Não foi possível falar com o Google Drive.';
}

function formatWhen(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

async function withDrive<T>(clientId: string, action: (token: string) => Promise<T>): Promise<T> {
  try {
    const token = await requestDriveAccessToken(clientId);
    return await action(token);
  } catch (error) {
    if (error instanceof DriveRequestError && error.status === 401) {
      clearDriveAccessToken();
      const token = await requestDriveAccessToken(clientId, { forceConsent: true });
      return action(token);
    }
    throw error;
  }
}

export function DriveBackup({
  data,
  onRestore,
}: {
  data: AppData;
  onRestore: (next: AppData) => void;
}) {
  const titleId = useId();
  const envClientId = resolveGoogleClientId(null);
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(envClientId);
  const [draft, setDraft] = useState(envClientId);
  const [showSetup, setShowSetup] = useState(!envClientId);
  const [busy, setBusy] = useState<'save' | 'load' | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, busy]);

  const openPanel = () => {
    const resolved = resolveGoogleClientId(localStorage.getItem(GOOGLE_CLIENT_ID_STORAGE_KEY));
    setClientId(resolved);
    setDraft(resolved);
    setShowSetup(!resolved);
    setMessage(null);
    setOpen(true);
    loadGoogleIdentity().catch(() => {
      /* o erro aparece se a pessoa tentar salvar sem o script */
    });
  };

  const rememberClientId = () => {
    const value = clientIdFromUserInput(draft);
    if (!isGoogleClientId(value)) {
      setMessage({
        tone: 'err',
        text: 'Cole o Client ID do Google. Ele termina com .apps.googleusercontent.com.',
      });
      return;
    }
    if (!envClientId) localStorage.setItem(GOOGLE_CLIENT_ID_STORAGE_KEY, value);
    setClientId(value);
    setDraft(value);
    setShowSetup(false);
    setMessage({ tone: 'ok', text: 'Identificação do Google salva neste aparelho.' });
  };

  const forgetClientId = () => {
    localStorage.removeItem(GOOGLE_CLIENT_ID_STORAGE_KEY);
    clearDriveAccessToken();
    setClientId('');
    setDraft('');
    setShowSetup(true);
    setMessage({ tone: 'ok', text: 'Identificação do Google apagada deste aparelho.' });
  };

  const salvar = async () => {
    setBusy('save');
    setMessage(null);
    try {
      const file = await withDrive(clientId, (token) => saveBackupToDrive(token, serializeBackup(data)));
      const when = formatWhen(file.modifiedTime);
      setMessage({
        tone: 'ok',
        text: when
          ? `Backup salvo em ${DRIVE_FOLDER_NAME}/${DRIVE_BACKUP_NAME}, atualizado em ${when}.`
          : `Backup salvo em ${DRIVE_FOLDER_NAME}/${DRIVE_BACKUP_NAME}.`,
      });
    } catch (error) {
      setMessage({ tone: 'err', text: errorText(error) });
    } finally {
      setBusy(null);
    }
  };

  const restaurar = async () => {
    if (
      !confirm(
        'Restaurar o backup do Google Drive? Os dados atuais deste aparelho serão substituídos.'
      )
    ) {
      return;
    }
    setBusy('load');
    setMessage(null);
    try {
      const loaded = await withDrive(clientId, (token) => loadBackupFromDrive(token));
      const parsed = parseBackupFile(loaded.content);
      if (!parsed) {
        setMessage({ tone: 'err', text: 'O arquivo no Drive não é um backup válido do ChocoGest.' });
        return;
      }
      onRestore(parsed);
      const when = formatWhen(loaded.file.modifiedTime);
      setMessage({
        tone: 'ok',
        text: when
          ? `Backup do Drive restaurado neste aparelho. Arquivo de ${when}.`
          : 'Backup do Drive restaurado neste aparelho.',
      });
    } catch (error) {
      setMessage({ tone: 'err', text: errorText(error) });
    } finally {
      setBusy(null);
    }
  };

  const dialog = open ? (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-3 pb-[max(0.75rem,var(--safe-bottom))] sm:p-6"
      onClick={() => {
        if (!busy) setOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg max-h-[min(92vh,42rem)] overflow-y-auto rounded-2xl border border-amber-700 bg-[#3a2c22] p-4 shadow-xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-xl font-bold text-amber-100">
            Backup no Google Drive
          </h2>
          <button
            type="button"
            className="touch-target rounded-xl px-3 text-sm text-amber-100 hover:bg-amber-800/60"
            onClick={() => {
              if (!busy) setOpen(false);
            }}
            disabled={busy !== null}
          >
            Fechar
          </button>
        </div>

        <p className="mb-4 text-sm leading-relaxed text-amber-100/90">
          Cole o Client ID e toque em Salvar identificação. Depois dá para gravar e restaurar o arquivo{' '}
          {DRIVE_FOLDER_NAME}/{DRIVE_BACKUP_NAME}.
        </p>

        {showSetup || !clientId ? (
          <div className="mb-4 space-y-3">
            {envClientId ? (
              <p className="text-sm text-amber-100/80">O Client ID já veio definido na publicação do site.</p>
            ) : (
              <>
                <label className="block">
                  <span className="mb-1 block text-sm text-amber-200/80">Client ID do Google</span>
                  <input
                    className="w-full rounded-xl border border-amber-700/60 bg-[#2c2118] px-3 py-2.5 text-base text-white focus:border-amber-500 focus:outline-none"
                    value={draft}
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                    inputMode="text"
                    placeholder="1234567890-abc.apps.googleusercontent.com"
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') rememberClientId();
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={rememberClientId}
                  className="touch-target inline-flex w-full items-center justify-center rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-500"
                >
                  Salvar identificação
                </button>
              </>
            )}
            <details className="text-sm leading-relaxed text-amber-100/90">
              <summary className="cursor-pointer text-amber-300">Como obter o Client ID</summary>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                <li>No Google Cloud, crie um projeto e ative a API Google Drive.</li>
                <li>Na tela de consentimento OAuth, escolha Externo e coloque seu e-mail como usuário de teste.</li>
                <li>
                  Adicione o escopo <span className="break-all">https://www.googleapis.com/auth/drive.file</span>.
                </li>
                <li>Em Credenciais, crie um ID do cliente OAuth do tipo Aplicativo da Web.</li>
                <li>
                  Nas origens JavaScript autorizadas, inclua <span className="break-all">{ORIGIN_PUBLICA}</span> e{' '}
                  <span className="break-all">{ORIGIN_LOCAL}</span>.
                </li>
              </ol>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <a
                  className="text-amber-300 underline"
                  href="https://console.cloud.google.com/apis/library/drive.googleapis.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir API Google Drive
                </a>
                <a
                  className="text-amber-300 underline"
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir credenciais
                </a>
              </p>
            </details>
          </div>
        ) : null}

        {clientId ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={salvar}
              disabled={busy !== null}
              className="touch-target inline-flex flex-1 items-center justify-center rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-60"
            >
              {busy === 'save' ? 'Salvando no Drive...' : 'Salvar backup no Drive'}
            </button>
            <button
              type="button"
              onClick={restaurar}
              disabled={busy !== null}
              className="touch-target inline-flex flex-1 items-center justify-center rounded-xl border border-amber-700 bg-amber-900/60 px-4 py-2.5 text-sm font-medium text-amber-100 hover:bg-amber-800 disabled:opacity-60"
            >
              {busy === 'load' ? 'Lendo o Drive...' : 'Restaurar backup do Drive'}
            </button>
          </div>
        ) : null}

        {message ? (
          <p
            role="status"
            className={`mt-4 text-sm leading-relaxed ${message.tone === 'ok' ? 'text-emerald-200' : 'text-red-200'}`}
          >
            {message.text}
          </p>
        ) : null}

        {clientId && !envClientId ? (
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <button type="button" className="text-amber-300 underline" onClick={() => setShowSetup((value) => !value)}>
              {showSetup ? 'Ocultar configuração' : 'Trocar Client ID'}
            </button>
            <button type="button" className="text-amber-300 underline" onClick={forgetClientId}>
              Esquecer neste aparelho
            </button>
          </div>
        ) : null}
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        className="touch-target inline-flex items-center justify-center gap-1 rounded-xl border border-amber-700 bg-amber-900/60 !px-2.5 py-2.5 text-xs font-medium text-amber-100 transition-colors hover:bg-amber-800 active:bg-amber-950 sm:!px-4 sm:text-sm"
      >
        <span aria-hidden>☁️</span>
        <span className="sm:hidden">Drive</span>
        <span className="hidden sm:inline">Google Drive</span>
      </button>
      {open && typeof document !== 'undefined' ? createPortal(dialog, document.body) : null}
    </>
  );
}
