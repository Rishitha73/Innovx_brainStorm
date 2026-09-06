// Pre-Submission Error Guard - Background Service Worker (Phase 4)
console.log('Pre-Submission Error Guard background service worker active');

// In-memory registry of tab portal, form, and document states
const tabStatusMap = new Map();

chrome.runtime.onInstalled.addListener((details) => {
  console.log('Pre-Submission Error Guard installed/updated. Reason:', details.reason);
});

// Clean up closed tabs
chrome.tabs.onRemoved.addListener((tabId) => {
  tabStatusMap.delete(tabId);
});

let creatingOffscreen = null;

async function hasOffscreenDocument(offscreenUrl) {
  if (chrome.runtime && typeof chrome.runtime.getContexts === 'function') {
    try {
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
      });
      return existingContexts.length > 0;
    } catch (e) {
      return false;
    }
  }
  return false;
}

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');

  if (await hasOffscreenDocument(offscreenUrl)) {
    return;
  }

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  if (chrome.offscreen && typeof chrome.offscreen.createDocument === 'function') {
    creatingOffscreen = (async () => {
      try {
        console.log('[Background] Creating offscreen document for OCR worker...');
        await chrome.offscreen.createDocument({
          url: 'offscreen/offscreen.html',
          reasons: ['WORKERS'],
          justification: 'Run local Tesseract OCR in an extension-owned document.'
        });
        console.log('[Background] Offscreen document created successfully.');
      } catch (err) {
        if (!err.message || !err.message.includes('Only a single offscreen document')) {
          console.error('[Background] Failed to create offscreen document:', err);
          throw err;
        }
      } finally {
        creatingOffscreen = null;
      }
    })();
    await creatingOffscreen;
  } else {
    console.warn('[Background] chrome.offscreen API not available.');
  }
}

// Pre-warm offscreen document on service worker start
ensureOffscreenDocument().catch(() => {});

// Helper to send message to offscreen document with retry for listener startup
async function sendToOffscreenWithRetry(payload, maxAttempts = 3, delayMs = 150) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log('[OCR TRACE] background: forwarding OCR request');
    const res = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: 'PERFORM_OCR',
          target: 'offscreen',
          payload
        },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message });
          } else {
            resolve({ success: true, response });
          }
        }
      );
    });

    if (res.success) {
      console.log('[OCR TRACE] background: received OCR response');
      return res.response;
    }

    if (res.error && res.error.includes('Receiving end does not exist') && attempt < maxAttempts) {
      console.warn(`[Background] Offscreen listener not ready on attempt ${attempt}, retrying in ${delayMs}ms...`);
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }

    throw new Error(res.error || 'Unknown offscreen messaging error');
  }
}

// Listen for runtime messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : null;

  if (message && message.type === 'PERFORM_OCR' && message.target !== 'offscreen') {
    console.log('[OCR TRACE] background: PERFORM_OCR received');
    (async () => {
      try {
        console.log('[OCR TRACE] background: ensuring offscreen document');
        await ensureOffscreenDocument();
        console.log('[OCR TRACE] background: offscreen document ready');
        const ocrResult = await sendToOffscreenWithRetry(message.payload);
        sendResponse(ocrResult);
      } catch (err) {
        console.error('[Background] Offscreen OCR error:', err);
        sendResponse({
          status: 'failed',
          text: '',
          confidence: 0,
          reasons: [`Offscreen OCR error: ${err.message}`]
        });
      }
    })();
    return true;
  }

  if (message && message.type === 'CONTENT_SCRIPT_LOADED') {
    if (tabId !== null && message.status) {
      const existing = tabStatusMap.get(tabId) || {};
      const merged = { ...existing, ...message.status };
      if ((!merged.formFields || Object.keys(merged.formFields).length === 0) && existing.formFields) {
        merged.formFields = existing.formFields;
      }
      if ((!merged.form || Object.keys(merged.form).length === 0) && existing.form) {
        merged.form = existing.form;
      }
      tabStatusMap.set(tabId, merged);
    }
    const originUrl = message.status?.url || message.url || (sender.tab ? sender.tab.url : 'unknown');
    console.log('Background received: CONTENT_SCRIPT_LOADED', {
      originUrl,
      tabId,
      portalId: message.status?.portalId || 'none',
      active: message.status?.active || false,
      formFieldsCount: Object.keys(message.status?.formFields || {}).length,
      hasDocument: Boolean(message.status?.document?.file),
      timestamp: message.timestamp || Date.now()
    });

    sendResponse({
      status: 'ACKNOWLEDGED',
      active: message.status?.active || false,
      receivedAt: Date.now()
    });
    return true;
  }

  if (message && message.type === 'PORTAL_ACTIVATED') {
    if (tabId !== null) {
      const existing = tabStatusMap.get(tabId) || {};
      const merged = { ...existing, ...message.status };
      if ((!merged.formFields || Object.keys(merged.formFields).length === 0) && existing.formFields) {
        merged.formFields = existing.formFields;
      }
      if ((!merged.form || Object.keys(merged.form).length === 0) && existing.form) {
        merged.form = existing.form;
      }
      tabStatusMap.set(tabId, merged);
    }
    console.log('Background received: PORTAL_ACTIVATED', {
      portalId: message.status?.portalId,
      tabId,
      url: message.status?.url,
      foundSelectors: `${message.status?.foundCount}/${message.status?.selectors?.length}`
    });
    sendResponse({ status: 'ACKNOWLEDGED', active: true });
    return true;
  }

  if (message && message.type === 'DOCUMENT_TYPE_CHANGED') {
    const existing = tabStatusMap.get(tabId) || {};
    existing.documentType = message.documentType || null;
    if (message.verification) {
      existing.verification = message.verification;
    }
    existing.timestamp = Date.now();
    tabStatusMap.set(tabId, existing);

    console.log('Background received: DOCUMENT_TYPE_CHANGED', {
      tabId,
      portalId: message.portalId,
      documentType: message.documentType
    });

    sendResponse({ status: 'ACKNOWLEDGED', documentType: message.documentType });
    return true;
  }

  if (message && message.type === 'FORM_FIELD_CHANGED') {
    const existing = tabStatusMap.get(tabId) || {};
    const fields = message.formFields || message.form || message.formState;
    if (fields) {
      existing.formFields = fields;
      existing.form = fields;
    }
    if (message.documentType !== undefined) {
      existing.documentType = message.documentType;
    }
    if (message.verification) {
      existing.verification = message.verification;
    }
    existing.timestamp = Date.now();
    tabStatusMap.set(tabId, existing);

    console.log('Background received: FORM_FIELD_CHANGED', {
      tabId,
      portalId: message.portalId,
      changedField: message.changedField,
      newValue: message.fieldData?.value
    });

    sendResponse({ status: 'ACKNOWLEDGED', field: message.changedField });
    return true;
  }

  if (message && message.type === 'FILE_VALIDATED') {
    const existing = tabStatusMap.get(tabId) || {};
    existing.document = message.document;
    const fields = message.formFields || message.form || message.formState;
    if (fields) {
      existing.formFields = fields;
      existing.form = fields;
    }
    if (message.documentType !== undefined) {
      existing.documentType = message.documentType;
    }
    if (message.verification) {
      existing.verification = message.verification;
    }
    existing.timestamp = Date.now();
    tabStatusMap.set(tabId, existing);

    console.log('Background received: FILE_VALIDATED', {
      tabId,
      portalId: message.portalId,
      fileName: message.document?.file?.name,
      passed: message.document?.fileValidation?.passed,
      reasons: message.document?.fileValidation?.reasons
    });

    sendResponse({ status: 'ACKNOWLEDGED', passed: message.document?.fileValidation?.passed });
    return true;
  }

  if (message && message.type === 'PORTAL_INACTIVE') {
    if (tabId !== null) {
      tabStatusMap.set(tabId, message.status);
    }
    console.log('Background received: PORTAL_INACTIVE', {
      tabId,
      url: message.status?.url
    });
    sendResponse({ status: 'ACKNOWLEDGED', active: false });
    return true;
  }

  if (
    message &&
    (message.type === 'GET_TAB_STATUS' ||
      message.type === 'GET_FORM_STATE' ||
      message.type === 'GET_DOCUMENT_STATE')
  ) {
    const requestedTabId = message.tabId || tabId;
    const status = requestedTabId ? tabStatusMap.get(requestedTabId) : null;
    if (status) {
      if (!status.form && status.formFields) {
        status.form = status.formFields;
      }
      if (!status.formFields && status.form) {
        status.formFields = status.form;
      }
    }
    sendResponse(status || { active: false, reason: 'No status recorded for tab' });
    return true;
  }

  return true;
});
