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

// Listen for runtime messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : null;

  if (message && message.type === 'CONTENT_SCRIPT_LOADED') {
    if (tabId !== null && message.status) {
      tabStatusMap.set(tabId, message.status);
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
      tabStatusMap.set(tabId, message.status);
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

  if (message && message.type === 'FORM_FIELD_CHANGED') {
    const existing = tabStatusMap.get(tabId) || {};
    existing.formFields = message.formFields;
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
    sendResponse(status || { active: false, reason: 'No status recorded for tab' });
    return true;
  }

  return true;
});
