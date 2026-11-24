const databaseName = 'luv-experiment-orientations-v1';
const storeName = 'results';
const settings = new Set([
  'vul-site-development-v1',
  'luv-experiment-polygon-alternatives-v1',
  'luv-experiment-site-polygon-morphogenesis-v1',
  'luv-experiment-site-catalog-v1',
  'luv-experiment-design-controls-v1',
  'luv-experiment-orientation-controls-v1',
  'luv-experiment-adaptive-controls-v1',
  'luv-experiment-orientation-selection-v1',
  'luv-experiment-site-orientation-selection-v1',
  'luv-experiment-site-rule-plans-v1',
  'luv-experiment-site-scene-v1',
  'luv-experiment-site-view-mode',
  'luv-experiment-architectural-display-v1',
  'luv-experiment-linear-rule-b-visible-v1',
  'luv-shared-site-rule-proofs-v1',
  'luv-site-typology-handoff-v1',
]);
const button = document.querySelector('#restore');
const status = document.querySelector('#status');


function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close any other tabs using the experiment on this origin.'));
  });
}

function restoreRecords(database, archive) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const writtenSettings = [];
    let failure;
    const count = store.count();
    count.onsuccess = () => {
      try {
        if (count.result || [...settings].some(key => localStorage.getItem(key) !== null)) {
          throw new Error('This origin already contains experiment records. Use a new local port or browser profile.');
        }
        for (const orientation of archive.orientations) store.add(orientation);
        for (const [key, value] of Object.entries(archive.localStorage)) {
          localStorage.setItem(key, value);
          writtenSettings.push(key);
        }
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };
    transaction.oncomplete = resolve;
    transaction.onabort = () => {
      for (const key of writtenSettings) localStorage.removeItem(key);
      reject(failure || transaction.error || new Error('The restore transaction stopped.'));
    };
  });
}

button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    const keyInput = document.querySelector('#access-key');
    const key = keyInput.value.trim();
    keyInput.value = '';
    const response = await fetch('/experiment/site-polygon-morphogenesis/checkpoint', {
      method: 'POST', redirect: 'error', headers: key ? {'X-LUV-Site-Key': key} : {},
    });
    if (!response.ok) throw new Error((await response.json()).error || 'Miami recovery is unavailable.');
    const bytes = await response.arrayBuffer();
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map(value => value.toString(16).padStart(2, '0')).join('');
    if (hash !== 'b23e0595b71c6daee42ff00fa721793da86950865b9f60bb090597240e384b7b') throw new Error('This file does not match the checkpoint for this checkout.');

    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const archive = await new Response(stream).json();
    if (archive.version !== 1 || !Array.isArray(archive.orientations) ||
        !Object.entries(archive.localStorage).every(([key, value]) => settings.has(key) && typeof value === 'string')) {
      throw new Error('Invalid checkpoint records.');
    }

    const database = await openDatabase();
    try {
      await restoreRecords(database, archive);
    } finally {
      database.close();
    }
    status.textContent = 'Restored ' + archive.orientations.length + ' orientation records and their saved site and design settings.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
