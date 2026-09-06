// Pre-Submission Error Guard - Cross-Verifier (Phase 8)
// Generic, schema-driven verification engine comparing form inputs against OCR-extracted document text

let schemaRegistry = null;
let schemaUtils = null;

if (typeof require !== 'undefined') {
  try {
    schemaRegistry = require('../schemas/index.js');
    schemaUtils = require('../schemas/schemaUtils.js');
  } catch (e) {}
}

if (!schemaRegistry && typeof globalThis !== 'undefined') {
  schemaRegistry = {
    getSchema: globalThis.getSchema,
    registerSchema: globalThis.registerSchema,
    getAllSchemas: globalThis.getAllSchemas
  };
  schemaUtils = {
    normalizeSchema: globalThis.normalizeSchema
  };
}

const DEFAULT_VERIFICATION_RULES = {
  minConfidenceThreshold: 60.0
};

class CrossVerifier {
  constructor(schemaOrRules = null) {
    if (schemaOrRules && schemaOrRules.documentType) {
      this.defaultSchema = this.resolveSchema(schemaOrRules);
      this.rules = { ...DEFAULT_VERIFICATION_RULES };
    } else {
      this.defaultSchema = null;
      this.rules = { ...DEFAULT_VERIFICATION_RULES, ...(schemaOrRules || {}) };
    }
    this.metrics = {
      crossVerificationRuns: 0,
      fieldComparisonRuns: {}
    };
  }

  resetMetrics() {
    this.metrics = {
      crossVerificationRuns: 0,
      fieldComparisonRuns: {}
    };
  }

  getMetrics() {
    return {
      crossVerificationRuns: this.metrics.crossVerificationRuns,
      fieldComparisonRuns: { ...this.metrics.fieldComparisonRuns }
    };
  }

  // Resolves a schema object or string identifier against the Schema Registry
  resolveSchema(schemaInput) {
    if (schemaInput === null || schemaInput === '') {
      return null;
    }

    if (schemaInput === undefined) {
      if (this.defaultSchema) return this.defaultSchema;
      const getter = (schemaRegistry && typeof schemaRegistry.getSchema === 'function')
        ? schemaRegistry.getSchema
        : (typeof globalThis !== 'undefined' ? globalThis.getSchema : null);
      return getter ? getter('incomeCertificate') : null;
    }

    if (typeof schemaInput === 'string') {
      const getter = (schemaRegistry && typeof schemaRegistry.getSchema === 'function')
        ? schemaRegistry.getSchema
        : (typeof globalThis !== 'undefined' ? globalThis.getSchema : null);
      return getter ? getter(schemaInput) : null;
    }

    if (typeof schemaInput === 'object') {
      const normalizer = (schemaUtils && typeof schemaUtils.normalizeSchema === 'function')
        ? schemaUtils.normalizeSchema
        : (typeof globalThis !== 'undefined' ? globalThis.normalizeSchema : null);
      return normalizer ? normalizer(schemaInput) : schemaInput;
    }

    return null;
  }

  // Escapes regular expression special characters
  escapeRegex(string) {
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Schema-driven extraction for a single field definition
  extractField(rawOcrText, fieldDef) {
    if (!rawOcrText || typeof rawOcrText !== 'string' || !fieldDef) {
      return null;
    }

    const text = rawOcrText.trim();
    const labels = Array.isArray(fieldDef.labels) && fieldDef.labels.length > 0
      ? fieldDef.labels
      : [fieldDef.name, fieldDef.logicalName, fieldDef.id].filter(Boolean);

    const labelPattern = labels.map((l) => this.escapeRegex(l).replace(/\\s\+/g, '\\s*')).join('|');

    if (fieldDef.extraction === 'date' || fieldDef.strategy === 'exactNormalizedDate' || fieldDef.id === 'dob' || fieldDef.logicalName === 'dob') {
      // 1. Date extraction regex anchored to field labels
      const dateLabelRegex = new RegExp(`(?:${labelPattern})\\s*[:\\-\\.]\\s*([0-9]{1,4}[\\/\\-\\.\\s][0-9]{1,2}[\\/\\-\\.\\s][0-9]{1,4})`, 'i');
      const dateMatch = text.match(dateLabelRegex);
      if (dateMatch && dateMatch[1]) {
        return dateMatch[1].trim();
      }

      // Fallback: block search within 30 chars after label
      const blockRegex = new RegExp(`(?:${labelPattern})[\\s\\S]{1,30}?([0-9]{1,4}[\\/\\-\\.\\s][0-9]{1,2}[\\/\\-\\.\\s][0-9]{1,4})`, 'i');
      const blockMatch = text.match(blockRegex);
      if (blockMatch && blockMatch[1]) {
        return blockMatch[1].trim();
      }
      return null;
    }

    // 2. Text / Identifier extraction regex anchored to field labels
    const textLabelRegex = new RegExp(`(?:${labelPattern})\\s*[:\\-\\.]\\s*([^\\r\\n]+)`, 'i');
    const textMatch = text.match(textLabelRegex);
    if (textMatch && textMatch[1]) {
      let candidate = textMatch[1].trim();
      // Remove any subsequent label keywords on the same line
      candidate = candidate.replace(/\s*(?:DOB|Date of Birth|Certificate|Cert No|Annual Income|Income|Address|Permanent Address).*/i, '').trim();
      // Clean leading and trailing punctuation
      candidate = candidate.replace(/^[\s|:;,"'-]+|[\s|:;,"'-]+$/g, '').trim();
      if (candidate.length > 0) {
        return candidate;
      }
    }

    return null;
  }

  // Schema-driven extraction across all fields in the active schema
  extractFields(rawOcrText, schemaParam = undefined) {
    const schema = this.resolveSchema(schemaParam);
    if (!schema || !Array.isArray(schema.fields)) {
      return {};
    }

    const extracted = {};
    schema.fields.forEach((fieldDef) => {
      const val = this.extractField(rawOcrText, fieldDef);
      const primaryKey = fieldDef.id || fieldDef.logicalName || fieldDef.name || fieldDef.formField;
      if (primaryKey) extracted[primaryKey] = val;
      if (fieldDef.id) extracted[fieldDef.id] = val;
      if (fieldDef.logicalName) extracted[fieldDef.logicalName] = val;
      if (fieldDef.formField && !extracted[fieldDef.formField]) extracted[fieldDef.formField] = val;
    });

    return extracted;
  }

  // Text normalization: lowercases, collapses whitespace, removes common honorifics and punctuation
  normalizeText(str) {
    if (!str || typeof str !== 'string') return '';
    let norm = str.toLowerCase().trim();
    // Strip common honorific titles at the start
    norm = norm.replace(/^(?:mr\.?|mrs\.?|ms\.?|shri\.?|shree\.?|smt\.?|dr\.?|kumari|master)\s+/i, '');
    // Remove punctuation marks
    norm = norm.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '');
    // Collapse internal whitespace
    norm = norm.replace(/\s+/g, ' ').trim();
    return norm;
  }

  // Exact alphanumeric string normalization: upper-cases, strips non-alphanumerics except hyphen
  normalizeExactIdentifier(str) {
    if (!str || typeof str !== 'string') return '';
    return str.toUpperCase().replace(/[\s_]/g, '').trim();
  }

  // Levenshtein distance implementation
  levenshteinDistance(a, b) {
    const s1 = a || '';
    const s2 = b || '';
    const m = s1.length;
    const n = s2.length;

    if (m === 0) return n;
    if (n === 0) return m;

    const matrix = [];
    for (let i = 0; i <= m; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= n; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return matrix[m][n];
  }

  // Calculates similarity ratio between 0.0 and 1.0
  calculateSimilarity(s1, s2) {
    if (s1 === s2) return 1.0;
    if (!s1 || !s2) return 0.0;
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0;
    const dist = this.levenshteinDistance(s1, s2);
    const score = 1.0 - (dist / maxLen);
    return Math.round(score * 1000) / 1000;
  }

  // Parses supported date formats into canonical YYYY-MM-DD
  parseCanonicalDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const clean = dateStr.trim();

    // 1. Match YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
    const isoMatch = clean.match(/^([12][0-9]{3})[\/\-\.\s](0?[1-9]|1[0-2])[\/\-\.\s](0?[1-9]|[12][0-9]|3[01])$/);
    if (isoMatch) {
      const y = isoMatch[1];
      const m = String(parseInt(isoMatch[2], 10)).padStart(2, '0');
      const d = String(parseInt(isoMatch[3], 10)).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    // 2. Match DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const dmyMatch = clean.match(/^(0?[1-9]|[12][0-9]|3[01])[\/\-\.\s](0?[1-9]|1[0-2])[\/\-\.\s]([12][0-9]{3})$/);
    if (dmyMatch) {
      const d = String(parseInt(dmyMatch[1], 10)).padStart(2, '0');
      const m = String(parseInt(dmyMatch[2], 10)).padStart(2, '0');
      const y = dmyMatch[3];
      return `${y}-${m}-${d}`;
    }

    return null;
  }

  // Helper to extract string value from form state input (raw string or { value: '...' })
  getFieldValue(input) {
    if (input === null || input === undefined) return '';
    if (typeof input === 'object' && input.value !== undefined) {
      return String(input.value || '').trim();
    }
    return String(input).trim();
  }

  // Generic schema-driven field comparison
  compareField(rawFormVal, rawDocVal, fieldDef, isOcrComplete, isConfidenceLow, ocrConfidence) {
    const fieldMetricKey = fieldDef.id || fieldDef.logicalName || fieldDef.formField || 'unknown';
    this.metrics.fieldComparisonRuns[fieldMetricKey] = (this.metrics.fieldComparisonRuns[fieldMetricKey] || 0) + 1;

    const strategy = fieldDef.strategy || fieldDef.comparison || 'exactNormalizedString';
    const threshold = typeof fieldDef.threshold === 'number' ? fieldDef.threshold : 0.85;
    const isRequired = fieldDef.required !== false;
    const displayField = fieldDef.name || fieldDef.logicalName || fieldDef.id || 'Field';

    const result = {
      field: fieldDef.id || fieldDef.logicalName || fieldDef.name,
      logicalName: fieldDef.logicalName || fieldDef.id,
      name: fieldDef.name || fieldDef.logicalName,
      strategy,
      formValue: rawFormVal,
      documentValue: rawDocVal,
      status: 'NEEDS_REVIEW',
      score: null,
      required: isRequired,
      reason: null
    };

    if (!isOcrComplete) {
      result.status = 'NEEDS_REVIEW';
      result.reason = 'Document OCR has not completed.';
      return result;
    }

    if (!rawFormVal) {
      if (isRequired) {
        result.status = 'NEEDS_REVIEW';
        result.reason = `Form field for ${displayField} is empty.`;
      } else {
        result.status = 'MATCH';
      }
      return result;
    }

    if (!rawDocVal) {
      if (isRequired) {
        result.status = 'NEEDS_REVIEW';
        result.reason = `${displayField} could not be found in document OCR.`;
      } else {
        result.status = 'NEEDS_REVIEW';
        result.reason = `Optional field ${displayField} could not be found in document OCR.`;
      }
      return result;
    }

    if (isConfidenceLow) {
      result.status = 'NEEDS_REVIEW';
      result.reason = `Low OCR confidence (${ocrConfidence}%). Manual review required.`;
      return result;
    }

    // --- Strategy 1: Fuzzy Normalized Matching ---
    if (strategy === 'fuzzyNormalized' || strategy === 'fuzzy') {
      const normForm = this.normalizeText(rawFormVal);
      const normDoc = this.normalizeText(rawDocVal);
      const score = this.calculateSimilarity(normForm, normDoc);
      result.score = score;

      if (score >= threshold) {
        result.status = 'MATCH';
      } else {
        result.status = 'MISMATCH';
        const reasonField = (fieldDef.id === 'name' || fieldDef.logicalName === 'name') ? 'name' : displayField;
        result.reason = `Form ${reasonField} "${rawFormVal}" does not match document ${reasonField} "${rawDocVal}" (similarity: ${score}).`;
      }
      return result;
    }

    // --- Strategy 2: Exact Normalized Date Matching ---
    if (strategy === 'exactNormalizedDate' || strategy === 'exact-date' || fieldDef.id === 'dob' || fieldDef.logicalName === 'dob') {
      const normFormDate = this.parseCanonicalDate(rawFormVal);
      const normDocDate = this.parseCanonicalDate(rawDocVal);
      result.normalizedFormValue = normFormDate;
      result.normalizedDocumentValue = normDocDate;

      if (!normDocDate) {
        result.status = 'NEEDS_REVIEW';
        result.reason = `Document date "${rawDocVal}" could not be parsed into a valid date.`;
      } else if (normFormDate && normFormDate === normDocDate) {
        result.status = 'MATCH';
      } else {
        result.status = 'MISMATCH';
        const reasonField = (fieldDef.id === 'dob' || fieldDef.logicalName === 'dob') ? 'DOB' : displayField;
        result.reason = `Form ${reasonField} (${rawFormVal}) does not match document ${reasonField} (${rawDocVal}).`;
      }
      return result;
    }

    // --- Strategy 3: Exact Normalized String Matching (Default) ---
    const normFormId = this.normalizeExactIdentifier(rawFormVal);
    const normDocId = this.normalizeExactIdentifier(rawDocVal);

    if (normFormId === normDocId) {
      result.status = 'MATCH';
    } else {
      result.status = 'MISMATCH';
      const reasonField = (fieldDef.id === 'certificateNumber' || fieldDef.logicalName === 'certificateNumber') ? 'certificate number' : displayField;
      result.reason = `Form ${reasonField} "${rawFormVal}" does not match document ${reasonField} "${rawDocVal}".`;
    }
    return result;
  }

  // Main Cross-Verification Entry Point
  // Supports verify({ formData, ocrResult, schema }) and verify(formData, ocrResult, schema)
  verify(formDataOrOptions = {}, ocrResultParam = null, schemaParam = undefined) {
    this.metrics.crossVerificationRuns++;

    let formData = {};
    let ocrResult = null;
    let schemaTarget = undefined;

    if (formDataOrOptions && formDataOrOptions.formData !== undefined) {
      formData = formDataOrOptions.formData || {};
      ocrResult = formDataOrOptions.ocrResult || null;
      schemaTarget = formDataOrOptions.schema !== undefined ? formDataOrOptions.schema : schemaParam;
    } else {
      formData = formDataOrOptions || {};
      ocrResult = ocrResultParam || null;
      schemaTarget = schemaParam;
    }

    // Resolve schema
    const schema = this.resolveSchema(schemaTarget);
    if (!schema || !Array.isArray(schema.fields) || schema.fields.length === 0) {
      const hasTarget = schemaTarget !== null && schemaTarget !== undefined && schemaTarget !== '';
      return {
        status: hasTarget ? 'failed' : 'waiting_for_schema',
        documentType: typeof schemaTarget === 'string' ? schemaTarget : (schemaTarget?.documentType || null),
        displayName: schemaTarget?.displayName || null,
        overallStatus: hasTarget ? 'SCHEMA_UNAVAILABLE' : 'WAITING_FOR_TYPE',
        fields: {},
        extractedFields: {},
        reasons: hasTarget
          ? [`No validation schema found for document type: "${typeof schemaTarget === 'string' ? schemaTarget : 'specified document type'}". Validation schema unavailable.`]
          : ['Waiting for document type. Please select a document type to begin cross-verification.']
      };
    }

    const isOcrComplete = Boolean(ocrResult && ocrResult.status === 'succeeded');
    const ocrConfidence = (ocrResult && typeof ocrResult.confidence === 'number')
      ? ocrResult.confidence
      : 0;
    const isConfidenceLow = isOcrComplete && (ocrConfidence < this.rules.minConfidenceThreshold);

    const extractedFields = isOcrComplete
      ? this.extractFields(ocrResult.text, schema)
      : {};

    const fieldResults = {};
    const reasons = [];
    let hasMismatch = false;
    let hasNeedsReview = false;

    schema.fields.forEach((fieldDef) => {
      const fieldId = fieldDef.id || fieldDef.logicalName || fieldDef.name || fieldDef.formField;
      const formKey = fieldDef.formField || fieldDef.id || fieldDef.logicalName || fieldDef.name;
      
      const rawFormVal = this.getFieldValue(
        formData[formKey] !== undefined ? formData[formKey] : (formData[fieldId] !== undefined ? formData[fieldId] : (formData[fieldDef.logicalName]))
      );
      const rawDocVal = extractedFields[fieldId] !== undefined
        ? extractedFields[fieldId]
        : (extractedFields[fieldDef.logicalName] !== undefined ? extractedFields[fieldDef.logicalName] : (extractedFields[fieldDef.id] || null));

      const fRes = this.compareField(
        rawFormVal,
        rawDocVal,
        fieldDef,
        isOcrComplete,
        isConfidenceLow,
        ocrConfidence
      );

      // Populate field results keyed by id, logicalName, and formField for convenience
      if (fieldId) fieldResults[fieldId] = fRes;
      if (fieldDef.id) fieldResults[fieldDef.id] = fRes;
      if (fieldDef.logicalName) fieldResults[fieldDef.logicalName] = fRes;
      if (fieldDef.formField && !fieldResults[fieldDef.formField]) fieldResults[fieldDef.formField] = fRes;

      if (fRes.status === 'MISMATCH') {
        hasMismatch = true;
        if (fRes.reason) reasons.push(fRes.reason);
      } else if (fRes.status === 'NEEDS_REVIEW') {
        if (fieldDef.required !== false) {
          hasNeedsReview = true;
          if (fRes.reason) reasons.push(fRes.reason);
        }
      }
    });

    // Compute Overall Status
    let overallStatus = 'MATCH';
    if (!isOcrComplete) {
      overallStatus = 'NEEDS_REVIEW';
    } else if (hasMismatch) {
      overallStatus = 'MISMATCH';
    } else if (hasNeedsReview) {
      overallStatus = 'NEEDS_REVIEW';
    }

    const isOcrProcessing = Boolean(ocrResult && ocrResult.status === 'processing');
    let verifStatus = 'idle';
    if (isOcrComplete) {
      verifStatus = 'completed';
    } else if (isOcrProcessing) {
      verifStatus = 'processing';
    }

    return {
      status: verifStatus,
      documentType: schema.documentType,
      displayName: schema.displayName,
      overallStatus,
      fields: fieldResults,
      extractedFields,
      reasons,
      timestamp: Date.now()
    };
  }

  // Phase 10: Single-field verification without re-running other fields or full OCR extraction
  verifyField(fieldId, rawFormVal, ocrResult = null, schemaInput = undefined, existingVerification = null) {
    const schema = this.resolveSchema(schemaInput);
    if (!schema || !Array.isArray(schema.fields) || schema.fields.length === 0) {
      if (existingVerification) return existingVerification;
      return this.verify({ [fieldId]: rawFormVal }, ocrResult, schemaInput);
    }

    const fieldDef = schema.fields.find((fd) =>
      fd.id === fieldId ||
      fd.logicalName === fieldId ||
      fd.formField === fieldId ||
      fd.name === fieldId
    );

    if (!fieldDef) {
      return existingVerification || this.verify({ [fieldId]: rawFormVal }, ocrResult, schema);
    }

    const isOcrComplete = Boolean(ocrResult && ocrResult.status === 'succeeded');
    const ocrConfidence = (ocrResult && typeof ocrResult.confidence === 'number')
      ? ocrResult.confidence
      : 0;
    const isConfidenceLow = isOcrComplete && (ocrConfidence < this.rules.minConfidenceThreshold);

    // Retrieve docValue: preferentially from existingVerification.extractedFields, or extract single field
    let rawDocVal = null;
    if (existingVerification && existingVerification.extractedFields) {
      const ef = existingVerification.extractedFields;
      rawDocVal = ef[fieldDef.id] !== undefined
        ? ef[fieldDef.id]
        : (ef[fieldDef.logicalName] !== undefined ? ef[fieldDef.logicalName] : (ef[fieldDef.formField] || null));
    }
    if (rawDocVal === null && isOcrComplete && ocrResult?.text) {
      rawDocVal = this.extractField(ocrResult.text, fieldDef);
    }

    const formattedFormVal = this.getFieldValue(rawFormVal);

    // Run single field comparison (increments fieldComparisonRuns only for this field)
    const fRes = this.compareField(
      formattedFormVal,
      rawDocVal,
      fieldDef,
      isOcrComplete,
      isConfidenceLow,
      ocrConfidence
    );

    if (!existingVerification || !existingVerification.fields) {
      const fullFormData = { [fieldId]: rawFormVal };
      return this.verify(fullFormData, ocrResult, schema);
    }

    // Merge into shallow clone of existing fields
    const updatedFields = { ...existingVerification.fields };
    if (fieldDef.id) updatedFields[fieldDef.id] = fRes;
    if (fieldDef.logicalName) updatedFields[fieldDef.logicalName] = fRes;
    if (fieldDef.formField) updatedFields[fieldDef.formField] = fRes;

    // Recalculate overallStatus and reasons across schema fields
    let hasMismatch = false;
    let hasNeedsReview = false;
    const reasons = [];

    schema.fields.forEach((fd) => {
      const curRes = updatedFields[fd.id] || updatedFields[fd.logicalName] || updatedFields[fd.formField];
      if (!curRes) return;
      if (curRes.status === 'MISMATCH') {
        hasMismatch = true;
        if (curRes.reason) reasons.push(curRes.reason);
      } else if (curRes.status === 'NEEDS_REVIEW') {
        if (fd.required !== false) {
          hasNeedsReview = true;
          if (curRes.reason) reasons.push(curRes.reason);
        }
      }
    });

    let overallStatus = 'MATCH';
    if (!isOcrComplete) {
      overallStatus = 'NEEDS_REVIEW';
    } else if (hasMismatch) {
      overallStatus = 'MISMATCH';
    } else if (hasNeedsReview) {
      overallStatus = 'NEEDS_REVIEW';
    }

    const isOcrProcessing = Boolean(ocrResult && ocrResult.status === 'processing');
    let verifStatus = 'idle';
    if (isOcrComplete) {
      verifStatus = 'completed';
    } else if (isOcrProcessing) {
      verifStatus = 'processing';
    }

    const updatedExtractedFields = { ...(existingVerification.extractedFields || {}) };
    if (rawDocVal !== null) {
      if (fieldDef.id) updatedExtractedFields[fieldDef.id] = rawDocVal;
      if (fieldDef.logicalName) updatedExtractedFields[fieldDef.logicalName] = rawDocVal;
    }

    return {
      status: verifStatus,
      documentType: schema.documentType,
      displayName: schema.displayName,
      overallStatus,
      fields: updatedFields,
      extractedFields: updatedExtractedFields,
      reasons,
      timestamp: Date.now()
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CrossVerifier,
    DEFAULT_VERIFICATION_RULES
  };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CrossVerifier = CrossVerifier;
  globalThis.DEFAULT_VERIFICATION_RULES = DEFAULT_VERIFICATION_RULES;
}
