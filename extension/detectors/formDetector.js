// Pre-Submission Error Guard - Form Detector (Phase 3)
// Reads and tracks configured form field values in real-time

class FormDetector {
  constructor(portalConfig) {
    this.portalConfig = portalConfig;
    this.formState = {};
    this.listeners = [];
    this.changeCallbacks = [];
  }

  // Initialize form field state and attach input/change listeners
  initialize() {
    this.cleanup();
    this.formState = {};

    if (!this.portalConfig || !Array.isArray(this.portalConfig.fields)) {
      return this.formState;
    }

    const doc = (typeof document !== 'undefined') ? document : (typeof globalThis !== 'undefined' ? globalThis.document : null);

    this.portalConfig.fields.forEach((fieldConfig) => {
      const { logicalName, selector, type } = fieldConfig;
      const element = doc ? doc.querySelector(selector) : null;

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

      // Read current value
      const currentValue = element.value !== undefined ? element.value : '';
      this.formState[logicalName] = {
        logicalName,
        value: currentValue,
        type: type || 'text',
        lastUpdated: Date.now(),
        found: true
      };

      console.log(`[Form Detector] Initialized field '${logicalName}': "${currentValue}"`);

      // Event handler for real-time tracking
      const handler = (event) => {
        const newValue = event.target ? event.target.value : '';
        this.formState[logicalName] = {
          logicalName,
          value: newValue,
          type: type || 'text',
          lastUpdated: Date.now(),
          found: true
        };

        console.log(`[Form Detector] Field '${logicalName}' updated: "${newValue}"`);

        // Notify subscribers of the update
        this.changeCallbacks.forEach((cb) => {
          try {
            cb(logicalName, this.formState[logicalName], this.getFormState());
          } catch (err) {
            console.error('[Form Detector] Error in change callback:', err);
          }
        });
      };

      element.addEventListener('input', handler);
      element.addEventListener('change', handler);

      this.listeners.push({ element, handler });
    });

    return this.formState;
  }

  // Return a snapshot of in-memory form state
  getFormState() {
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

  // Cleanup event listeners
  cleanup() {
    this.listeners.forEach(({ element, handler }) => {
      element.removeEventListener('input', handler);
      element.removeEventListener('change', handler);
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
