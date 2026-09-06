// Pre-Submission Error Guard - Portal Configuration (Phase 2)
// Defines supported portal endpoints and their expected DOM selectors

const PORTAL_CONFIGS = [
  {
    portalId: 'demo-scholarship-portal',
    displayName: 'Mock Scholarship Application Portal',
    matchUrls: [
      'http://localhost:5173/apply',
      'http://localhost:5173/',
      'http://127.0.0.1:5173/apply',
      'http://127.0.0.1:5173/'
    ],
    fields: [
      {
        logicalName: 'name',
        selector: '#applicant-name',
        type: 'text'
      },
      {
        logicalName: 'dob',
        selector: '#applicant-dob',
        type: 'date'
      },
      {
        logicalName: 'certificateNumber',
        selector: '#cert-number',
        type: 'text'
      }
    ],
    documentUpload: {
      selector: '#upload-certificate',
      logicalName: 'certificateFile'
    },
    documentTypeSelector: '#document-type',
    submitSelector: '#submit-application',
    formSelector: '#scholarship-form'
  }
];

// Helper to find matching portal config for a given URL
function matchPortal(currentUrl) {
  if (!currentUrl) return null;
  const cleanUrl = currentUrl.split('?')[0].split('#')[0].replace(/\/$/, '');
  
  return PORTAL_CONFIGS.find((config) =>
    config.matchUrls.some((pattern) => {
      const cleanPattern = pattern.split('?')[0].split('#')[0].replace(/\/$/, '');
      return cleanUrl === cleanPattern || cleanUrl.startsWith(cleanPattern);
    })
  ) || null;
}

// Helper to extract all configured selectors from a portal config
function getAllConfiguredSelectors(portalConfig) {
  if (!portalConfig) return [];
  const selectors = [];

  if (portalConfig.formSelector) {
    selectors.push({ name: 'Form Container', selector: portalConfig.formSelector, required: true });
  }

  if (Array.isArray(portalConfig.fields)) {
    portalConfig.fields.forEach((f) => {
      selectors.push({ name: `Field: ${f.logicalName}`, selector: f.selector, required: true });
    });
  }

  if (portalConfig.documentTypeSelector) {
    selectors.push({ name: 'Document Type Selector', selector: portalConfig.documentTypeSelector, required: true });
  }

  if (portalConfig.documentUpload && portalConfig.documentUpload.selector) {
    selectors.push({ name: 'Document Upload Input', selector: portalConfig.documentUpload.selector, required: true });
  }

  if (portalConfig.submitSelector) {
    selectors.push({ name: 'Submit Button', selector: portalConfig.submitSelector, required: true });
  }

  return selectors;
}

// Support Node.js / Vitest environment and Browser environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PORTAL_CONFIGS,
    matchPortal,
    getAllConfiguredSelectors
  };
} else if (typeof globalThis !== 'undefined') {
  globalThis.PORTAL_CONFIGS = PORTAL_CONFIGS;
  globalThis.matchPortal = matchPortal;
  globalThis.getAllConfiguredSelectors = getAllConfiguredSelectors;
}
