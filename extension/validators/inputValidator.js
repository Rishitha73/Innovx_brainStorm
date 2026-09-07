// Pre-Submission Error Guard - Input Validator (Phase 12 Unified Popup)
// Pure field-level format and presence validation for application form inputs.
// No DOM or external dependencies — safe to require in tests and browser alike.

const INPUT_VALIDATION_RULES = {
  name: {
    priority: 1,
    required: true,
    validate(value) {
      const v = (value || '').trim();
      if (!v) {
        return { valid: false, errorCode: 'MISSING_FIELD', errorMessage: 'Please enter your full name before continuing.' };
      }
      if (v.length < 2) {
        return { valid: false, errorCode: 'INVALID_NAME', errorMessage: 'Please enter a valid name (at least 2 characters).' };
      }
      // Must not contain digits or special characters beyond letters, spaces, dots, hyphens, apostrophes
      if (/[0-9!@#$%^&*()_+=\[\]{};:"|<>?,/\\~`]/.test(v)) {
        return { valid: false, errorCode: 'INVALID_NAME', errorMessage: 'Please enter a valid name using only letters, spaces, hyphens, or apostrophes.' };
      }
      return { valid: true, errorCode: null, errorMessage: null };
    }
  },

  dob: {
    priority: 2,
    required: true,
    validate(value) {
      const v = (value || '').trim();
      if (!v) {
        return { valid: false, errorCode: 'MISSING_FIELD', errorMessage: 'Please enter your date of birth before continuing.' };
      }
      const parsed = new Date(v);
      if (isNaN(parsed.getTime())) {
        return { valid: false, errorCode: 'INVALID_DOB', errorMessage: 'Please enter a valid date of birth.' };
      }
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      if (parsed > now) {
        return { valid: false, errorCode: 'FUTURE_DOB', errorMessage: 'Date of birth cannot be in the future.' };
      }
      // Must not be impossibly old (> 120 years)
      const minDate = new Date();
      minDate.setFullYear(minDate.getFullYear() - 120);
      if (parsed < minDate) {
        return { valid: false, errorCode: 'INVALID_DOB', errorMessage: 'Please enter a valid date of birth.' };
      }
      return { valid: true, errorCode: null, errorMessage: null };
    }
  },

  mobile: {
    priority: 3,
    required: true,
    validate(value) {
      const v = (value || '').trim();
      if (!v) {
        return { valid: false, errorCode: 'MISSING_FIELD', errorMessage: 'Please enter your mobile number before continuing.' };
      }
      // Exactly 10 digits
      if (!/^\d{10}$/.test(v)) {
        return { valid: false, errorCode: 'INVALID_MOBILE', errorMessage: 'Please enter a valid 10-digit mobile number.' };
      }
      return { valid: true, errorCode: null, errorMessage: null };
    }
  },

  email: {
    priority: 4,
    required: false, // Optional — only validate if non-empty
    validate(value) {
      const v = (value || '').trim();
      if (!v) {
        return { valid: true, errorCode: null, errorMessage: null }; // optional — skip
      }
      // Basic RFC-5322 inspired pattern
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
        return { valid: false, errorCode: 'INVALID_EMAIL', errorMessage: 'Please enter a valid email address.' };
      }
      return { valid: true, errorCode: null, errorMessage: null };
    }
  },

  certificateNumber: {
    priority: 5,
    required: true,
    validate(value) {
      const v = (value || '').trim();
      if (!v) {
        return { valid: false, errorCode: 'MISSING_FIELD', errorMessage: 'Please enter the certificate number before continuing.' };
      }
      if (v.length < 3) {
        return { valid: false, errorCode: 'INVALID_CERT_NUMBER', errorMessage: 'Please enter a valid certificate number.' };
      }
      // Must be alphanumeric + hyphens/slashes only
      if (!/^[A-Za-z0-9\-\/\s]+$/.test(v)) {
        return { valid: false, errorCode: 'INVALID_CERT_NUMBER', errorMessage: 'Please enter a valid certificate number (letters, digits, and hyphens only).' };
      }
      return { valid: true, errorCode: null, errorMessage: null };
    }
  }
};

/**
 * Validates a single field by logical name.
 * @param {string} fieldName  - logical field name (e.g. 'name', 'dob', 'mobile')
 * @param {string} value      - raw string value from the form input
 * @returns {{ valid: boolean, errorCode: string|null, errorMessage: string|null }}
 */
function validateField(fieldName, value) {
  const rule = INPUT_VALIDATION_RULES[fieldName];
  if (!rule) {
    return { valid: true, errorCode: null, errorMessage: null };
  }
  return rule.validate(value);
}

/**
 * Validates all configured fields from a formState object.
 * @param {Object} formState - map of { logicalName: { value: string } | string }
 * @returns {Array<{ field: string, errorCode: string, errorMessage: string, priority: number }>}
 *          Sorted by priority (lowest = highest urgency).
 */
function validateAllFields(formState) {
  const errors = [];
  if (!formState) return errors;

  // Detect which optional/contextual fields exist in the form/DOM
  const doc = (typeof document !== 'undefined') ? document : null;
  const hasMobileInput = doc ? Boolean(doc.querySelector('#applicant-mobile, [name="mobile"], #mobile')) : false;
  const hasEmailInput = doc ? Boolean(doc.querySelector('#applicant-email, [name="email"], #email')) : false;

  const fields = Object.keys(INPUT_VALIDATION_RULES);
  fields.forEach((fieldName) => {
    // If mobile is not present in formState AND not present in DOM, skip it
    if (fieldName === 'mobile' && (formState[fieldName] === undefined || formState[fieldName] === null) && !hasMobileInput) {
      return;
    }
    // If email is not present in formState AND not present in DOM, skip it
    if (fieldName === 'email' && (formState[fieldName] === undefined || formState[fieldName] === null) && !hasEmailInput) {
      return;
    }

    const raw = formState[fieldName];
    let value = raw && typeof raw === 'object' ? raw.value : (raw || '');

    // Fallback: If contextual field was not present in formState (undefined or null) but exists in live DOM, use live DOM value
    if ((raw === undefined || raw === null) && doc) {
      if (fieldName === 'mobile') {
        const el = doc.querySelector('#applicant-mobile, [name="mobile"], #mobile');
        if (el && el.value !== undefined && el.value.trim() !== '') {
          value = el.value.trim();
        }
      } else if (fieldName === 'email') {
        const el = doc.querySelector('#applicant-email, [name="email"], #email');
        if (el && el.value !== undefined && el.value.trim() !== '') {
          value = el.value.trim();
        }
      }
    }
    const result = validateField(fieldName, value);
    if (!result.valid) {
      errors.push({
        field: fieldName,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        priority: INPUT_VALIDATION_RULES[fieldName].priority
      });
    }
  });

  // Sort by priority ascending (1 = highest urgency)
  errors.sort((a, b) => a.priority - b.priority);
  return errors;
}

// Support Node.js / Vitest environment and Browser environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validateField, validateAllFields, INPUT_VALIDATION_RULES };
} else if (typeof globalThis !== 'undefined') {
  globalThis.validateField = validateField;
  globalThis.validateAllFields = validateAllFields;
  globalThis.INPUT_VALIDATION_RULES = INPUT_VALIDATION_RULES;
}
