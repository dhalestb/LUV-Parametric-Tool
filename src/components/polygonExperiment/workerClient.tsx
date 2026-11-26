'use client';

import { useState } from 'react';
import { isSiteIntegrationPreview } from './siteWorkerPolicy';

const usePreviewSession = isSiteIntegrationPreview(
  process.env.NEXT_PUBLIC_VERCEL_ENV, process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF,
);

let accessKey = '';

export async function requestSiteWorker(url: string, init: RequestInit) {
  const target = new URL(url, window.location.origin);
  if (target.origin !== window.location.origin) throw Error('Site workers require the same origin.');
  const headers = new Headers(init.headers);
  if (usePreviewSession) headers.set('Accept', 'application/json');
  else if (accessKey) headers.set('X-LUV-Site-Key', accessKey);
  const response = await fetch(target, {...init, headers, credentials: 'same-origin', redirect: 'error'});
  if (usePreviewSession && response.status === 401) {
    throw Error('Sign in to the Vercel Preview again to run this operation.');
  }
  return response;
}

export function WorkerAccess() {
  const [enabled, setEnabled] = useState(Boolean(accessKey));
  if (usePreviewSession) return null;
  return <details>
    <summary>Hosted generation access</summary>
    <form onSubmit={event => {
      event.preventDefault();
      const input = new FormData(event.currentTarget).get('key');
      accessKey = typeof input === 'string' ? input.trim() : '';
      setEnabled(Boolean(accessKey));
      event.currentTarget.reset();
    }}>
      <label>Preview access key <input name="key" type="password" autoComplete="off"/></label>
      <button type="submit">Use until reload</button>
      <p role="status">{enabled ? 'Key set for this tab until reload.' : 'Enter the key configured for this deployment.'}</p>
    </form>
  </details>;
}
