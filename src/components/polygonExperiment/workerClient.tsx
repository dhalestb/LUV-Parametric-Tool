'use client';

import { useState } from 'react';

let accessKey = '';

export function requestSiteWorker(url: string, init: RequestInit) {
  const target = new URL(url, window.location.origin);
  if (target.origin !== window.location.origin) throw Error('Site workers require the same origin.');
  const headers = new Headers(init.headers);
  if (accessKey) headers.set('X-LUV-Site-Key', accessKey);
  return fetch(target, {...init, headers, redirect: 'error'});
}

export function WorkerAccess() {
  const [enabled, setEnabled] = useState(Boolean(accessKey));
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
