'use strict';

// Only read the owner's public aggregate. Never write counts or send signup data.
(() => {
  const card = document.querySelector('#registration-stats');
  if (!card) return;
  const number = document.querySelector('#registered-count');
  const status = document.querySelector('#registered-status');
  const refreshInterval = 60000;
  let refreshTimer;
  let activeRequest;
  let stopped = false;

  function readCount(documentData) {
    const field = documentData?.fields?.count;
    const raw = field?.integerValue ?? field?.stringValue ?? field?.doubleValue;
    if (typeof raw !== 'string' && typeof raw !== 'number') throw new Error('Missing count');
    if (typeof raw === 'string' && !/^\d+$/.test(raw.trim())) throw new Error('Invalid count');
    const count = Number(raw);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid count');
    return count;
  }

  async function refreshCount() {
    if (stopped || document.hidden || activeRequest) return;
    clearTimeout(refreshTimer);
    const controller = new AbortController();
    activeRequest = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(card.dataset.statsEndpoint, {
        method: 'GET', headers: {Accept: 'application/json'},
        credentials: 'omit', cache: 'no-store', signal: controller.signal,
      });
      if (!response.ok) throw new Error('Count unavailable');
      const count = readCount(await response.json());
      if (stopped) return;
      number.textContent = count.toLocaleString('en-PK');
      status.textContent = 'On the early-access list';
      card.dataset.state = 'ready';
    } catch {
      if (stopped) return;
      // An unavailable count is never presented as zero, an estimate or a saved total.
      number.textContent = '—';
      status.textContent = 'Count temporarily unavailable';
      card.dataset.state = 'unavailable';
    } finally {
      clearTimeout(timeout);
      activeRequest = undefined;
      if (!stopped && !document.hidden) refreshTimer = setTimeout(refreshCount, refreshInterval);
    }
  }

  document.addEventListener('visibilitychange', () => {
    clearTimeout(refreshTimer);
    if (!document.hidden) refreshCount();
  });
  addEventListener('pagehide', () => {
    stopped = true;
    clearTimeout(refreshTimer);
    activeRequest?.abort();
  });
  addEventListener('pageshow', event => {
    if (event.persisted) { stopped = false; refreshCount(); }
  });
  refreshCount();
})();
