// Pre-Submission Error Guard - Form Detector (Phase 3)
// Reads and tracks configured form field values in real-time

class FormDetector {
  constructor(portalConfig) {
    this.portalConfig = portalConfig;
    this.formState = {};
    this.listeners = [];
    this.changeCallbacks = [];
    this.pollInterval = null;
    this.observer = null;
  }

  // Helper to resolve an element for a field selector with resilient fallbacks
  resolveElement(doc, selector) {
    if (!doc || !selector) return null;
    let el = doc.querySelector(selector);
    if (!el && selector === '#cert-number') {
      el = doc.querySelector('#cert-num');
    } else if (!el && selector === '#cert-num') {
      el = doc.querySelector('#cert-number');
    } else if (!el && (selector === '#applicant-mobile' || selector === '#mobile')) {
      el = doc.querySelector('#applicant-mobile, [name="mobile"], #mobile');
    } else if (!el && (selector === '#applicant-email' || selector === '#email')) {
      el = doc.querySelector('#applicant-email, [name="email"], #email');
    }
    return el;
  }

  // Returns all configured field definitions including the document-type selector
  getFieldConfigs() {
    const fields = Array.isArray(this.portalConfig?.fields) ? [...this.portalConfig.fields] : [];
    if (this.portalConfig?.documentTypeSelector && !fields.some((f) => f.logicalName === 'documentType')) {
      fields.push({
        logicalName: 'documentType',
        selector: this.portalConfig.documentTypeSelector,
        type: 'select'
      });
    }

    // Automatically detect standard inputs (like mobile and email) if present in the live DOM
    const doc = (typeof document !== 'undefined') ? document : (typeof globalThis !== 'undefined' ? globalThis.document : null);
    if (doc) {
      if (!fields.some((f) => f.logicalName === 'mobile')) {
        const mobileEl = doc.querySelector('#applicant-mobile, [name="mobile"], #mobile');
        if (mobileEl) {
          fields.push({
            logicalName: 'mobile',
            selector: mobileEl.id ? `#${mobileEl.id}` : (mobileEl.name ? `[name="${mobileEl.name}"]` : '#applicant-mobile'),
            type: 'tel'
          });
        }
      }
      if (!fields.some((f) => f.logicalName === 'email')) {
        const emailEl = doc.querySelector('#applicant-email, [name="email"], #email');
        if (emailEl) {
          fields.push({
            logicalName: 'email',
            selector: emailEl.id ? `#${emailEl.id}` : (emailEl.name ? `[name="${emailEl.name}"]` : '#applicant-email'),
            type: 'email'
          });
        }
      }
    }

    return fields;
  }

  // Initialize form field state and attach input/change listeners
  initialize() {
    this.cleanup();
    this.formState = {};

    console.log('[FORM TRACE] FormDetector initialized');

    if (!this.portalConfig) {
      return this.formState;
    }

    const fieldConfigs = this.getFieldConfigs();
    if (fieldConfigs.length === 0) {
      return this.formState;
    }

    const nameField = fieldConfigs.find((f) => f.logicalName === 'name');
    const dobField = fieldConfigs.find((f) => f.logicalName === 'dob');
    const certField = fieldConfigs.find((f) => f.logicalName === 'certificateNumber');
    const docTypeField = fieldConfigs.find((f) => f.logicalName === 'documentType');

    if (nameField) console.log(`[FORM TRACE] name selector = ${nameField.selector}`);
    if (dobField) console.log(`[FORM TRACE] dob selector = ${dobField.selector}`);
    if (certField) console.log(`[FORM TRACE] certificate selector = ${certField.selector}`);
    if (docTypeField) console.log(`[FORM TRACE] documentType selector = ${docTypeField.selector}`);

    const doc = (typeof document !== 'undefined') ? document : (typeof globalThis !== 'undefined' ? globalThis.document : null);

    fieldConfigs.forEach((fieldConfig) => {
      const { logicalName, selector, type } = fieldConfig;
      const element = this.resolveElement(doc, selector);

      if (!element) {
        console.warn(
          `[Pre-Submission Error Guard] [WARN] Missing configured form field: ${logicalName} (${selector})`
        );
        this.formState[logicalName] = {
          logicalName,
          value: '',
          type: type || 'text',
          lastUpdated: Date.now(),
          found: false
        };
        return;
      }

      // Read current value from real DOM element (React controlled or pre-populated)
      const currentValue = element.value !== undefined ? element.value : '';
      this.formState[logicalName] = {
        logicalName,
        value: currentValue,
        type: type || 'text',
        lastUpdated: Date.now(),
        found: true
      };

      console.log(`[FORM TRACE] ${logicalName} = ${currentValue}`);
      console.log(`[Form Detector] Initialized field '${logicalName}': "${currentValue}"`);

      // Direct event handlers for real-time tracking
      const directInputHandler = (event) => {
        const val = event.target ? event.target.value : '';
        this.handleFieldUpdate(logicalName, val, 'input');
      };

      const directChangeHandler = (event) => {
        const val = event.target ? event.target.value : '';
        this.handleFieldUpdate(logicalName, val, 'change');
      };

      element.addEventListener('input', directInputHandler);
      element.addEventListener('change', directChangeHandler);

      this.listeners.push({ element, handler: directInputHandler, event: 'input' });
      this.listeners.push({ element, handler: directChangeHandler, event: 'change' });
    });

    // Delegated event listeners on document in capture phase (immune to React re-mounts / dynamic DOM updates)
    if (doc) {
      const delegatedInputHandler = (event) => {
        this.handleDelegatedEvent(event, 'input');
      };
      const delegatedChangeHandler = (event) => {
        this.handleDelegatedEvent(event, 'change');
      };

      doc.addEventListener('input', delegatedInputHandler, true);
      doc.addEventListener('change', delegatedChangeHandler, true);
      this.listeners.push({ element: doc, handler: delegatedInputHandler, event: 'input', capture: true });
      this.listeners.push({ element: doc, handler: delegatedChangeHandler, event: 'change', capture: true });

      // Track clicks (e.g. TestDataHelper presets or UI buttons that update React state programmatically)
      const delegatedClickHandler = () => {
        setTimeout(() => {
          this.syncWithDom();
        }, 25);
      };
      doc.addEventListener('click', delegatedClickHandler, true);
      this.listeners.push({ element: doc, handler: delegatedClickHandler, event: 'click', capture: true });

      // MutationObserver to detect DOM subtree and value attribute changes
      if (typeof MutationObserver !== 'undefined' && doc.body) {
        try {
          this.observer = new MutationObserver(() => {
            this.syncWithDom();
          });
          this.observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['value'] });
        } catch (e) {}
      }

      // Background periodic sync fallback (every 500ms)
      if (typeof setInterval !== 'undefined') {
        this.pollInterval = setInterval(() => {
          this.syncWithDom();
        }, 500);
      }
    }

    return this.formState;
  }

  // Handles updates to a specific field
  handleFieldUpdate(logicalName, newValue, eventType = 'input') {
    const prevValue = this.formState[logicalName] ? this.formState[logicalName].value : undefined;
    const fieldConfig = this.getFieldConfigs().find((f) => f.logicalName === logicalName) || {};

    this.formState[logicalName] = {
      logicalName,
      value: newValue,
      type: fieldConfig.type || (logicalName === 'documentType' ? 'select' : 'text'),
      lastUpdated: Date.now(),
      found: true
    };

    console.log(`[FORM TRACE] ${eventType} event`);
    console.log(`[FORM TRACE] field = ${logicalName}`);
    console.log(`[FORM TRACE] value = ${newValue}`);
    console.log(`[Form Detector] Field '${logicalName}' updated: "${newValue}"`);

    if (prevValue !== newValue) {
      const snapshot = this.getFormState(false);
      this.changeCallbacks.forEach((cb) => {
        try {
          cb(logicalName, this.formState[logicalName], snapshot);
        } catch (err) {
          console.error('[Form Detector] Error in change callback:', err);
        }
      });
    }
  }

  // Handles delegated DOM input/change events matching configured selectors
  handleDelegatedEvent(event, eventType) {
    if (!event || !event.target || !this.portalConfig) {
      return;
    }

    const target = event.target;
    this.getFieldConfigs().forEach((fieldConfig) => {
      const { logicalName, selector } = fieldConfig;
      const targetId = target.id ? `#${target.id}` : '';
      const isMatch =
        (targetId && (targetId === selector || (selector === '#cert-number' && targetId === '#cert-num') || (selector === '#cert-num' && targetId === '#cert-number'))) ||
        (typeof target.matches === 'function' && (target.matches(selector) || (selector === '#cert-number' && target.matches('#cert-num')) || (selector === '#cert-num' && target.matches('#cert-number')))) ||
        (logicalName === 'mobile' && (target.id === 'applicant-mobile' || target.name === 'mobile' || target.id === 'mobile')) ||
        (logicalName === 'email' && (target.id === 'applicant-email' || target.name === 'email' || target.id === 'email'));

      if (isMatch) {
        const newValue = target.value !== undefined ? target.value : '';
        this.handleFieldUpdate(logicalName, newValue, eventType);
      }
    });
  }

  // Synchronizes state directly with current DOM input values
  syncWithDom() {
    if (!this.portalConfig) {
      return this.formState;
    }

    const doc = (typeof document !== 'undefined') ? document : (typeof globalThis !== 'undefined' ? globalThis.document : null);
    if (!doc) return this.formState;

    let hasChanged = false;
    let firstChangedField = null;

    this.getFieldConfigs().forEach((fieldConfig) => {
      const { logicalName, selector, type } = fieldConfig;
      const element = this.resolveElement(doc, selector);

      if (!element) {
        if (!this.formState[logicalName] || this.formState[logicalName].found) {
          this.formState[logicalName] = {
            logicalName,
            value: '',
            type: type || (logicalName === 'documentType' ? 'select' : 'text'),
            lastUpdated: Date.now(),
            found: false
          };
          hasChanged = true;
          if (!firstChangedField) firstChangedField = logicalName;
        }
        return;
      }

      const currentValue = element.value !== undefined ? element.value : '';
      const previousValue = this.formState[logicalName] ? this.formState[logicalName].value : undefined;
      const wasFound = this.formState[logicalName] ? this.formState[logicalName].found : false;

      if (previousValue !== currentValue || !wasFound) {
        this.formState[logicalName] = {
          logicalName,
          value: currentValue,
          type: type || (logicalName === 'documentType' ? 'select' : 'text'),
          lastUpdated: Date.now(),
          found: true
        };
        hasChanged = true;
        if (!firstChangedField) firstChangedField = logicalName;
      }
    });

    if (hasChanged && firstChangedField) {
      const snapshot = this.getFormState(false);
      this.changeCallbacks.forEach((cb) => {
        try {
          cb(firstChangedField, this.formState[firstChangedField], snapshot);
        } catch (err) {
          console.error('[Form Detector] Error in change callback during syncWithDom:', err);
        }
      });
    }

    return this.formState;
  }

  // Return a snapshot of in-memory form state (synchronizing with DOM by default)
  getFormState(shouldSync = true) {
    if (shouldSync) {
      this.syncWithDom();
    }
    const snapshot = {};
    Object.keys(this.formState).forEach((key) => {
      snapshot[key] = { ...this.formState[key] };
    });
    return snapshot;
  }

  // Register callback to be triggered on any field change
  onFieldChange(callback) {
    if (typeof callback === 'function') {
      this.changeCallbacks.push(callback);
    }
  }

  // Cleanup event listeners, intervals, and observers
  cleanup() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.listeners.forEach(({ element, handler, event, capture }) => {
      if (element && typeof element.removeEventListener === 'function') {
        element.removeEventListener(event, handler, Boolean(capture));
      }
    });
    this.listeners = [];
  }
}

// Support Node.js / Vitest environment and Browser environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FormDetector };
} else if (typeof globalThis !== 'undefined') {
  globalThis.FormDetector = FormDetector;
}
