// Pre-Submission Error Guard - Schema Utilities (Phase 8)
// Normalizes and validates declarative validation schemas

const STRATEGY_ALIASES = {
  fuzzy: 'fuzzyNormalized',
  fuzzyNormalized: 'fuzzyNormalized',
  'exact-date': 'exactNormalizedDate',
  exactNormalizedDate: 'exactNormalizedDate',
  exactDate: 'exactNormalizedDate',
  exact: 'exactNormalizedString',
  exactNormalizedString: 'exactNormalizedString',
  exactString: 'exactNormalizedString'
};

const DEFAULT_FIELD_LABELS = {
  name: [
    'Applicant Name',
    'Candidate Name',
    'Name of Applicant',
    'Name of Candidate',
    'Name of Student',
    'Student Name',
    'Applicant',
    'Candidate',
    'Name'
  ],
  dob: [
    'Date of Birth',
    'DOB',
    'D.O.B.',
    'Birth Date'
  ],
  certificateNumber: [
    'Certificate No',
    'Certificate Number',
    'Cert No',
    'Certificate ID',
    'Certificate Code',
    'Application No',
    'Cert ID'
  ],
  address: [
    'Residential Address',
    'Permanent Address',
    'Address',
    'Residence'
  ]
};

function normalizeSchema(schema) {
  if (!schema || typeof schema !== 'object') {
    return null;
  }

  const documentType = schema.documentType || schema.type || 'unknown';
  const displayName = schema.displayName || documentType;
  let rawFields = Array.isArray(schema.fields) ? [...schema.fields] : [];

  // Fallback: If only PRD Section 19 `extract` and `compare` arrays were supplied
  if (rawFields.length === 0 && Array.isArray(schema.extract)) {
    const compareMap = {};
    if (Array.isArray(schema.compare)) {
      schema.compare.forEach((c) => {
        if (c && c.field) {
          compareMap[c.field] = c;
        }
      });
    }

    rawFields = schema.extract.map((fieldName) => {
      const comp = compareMap[fieldName] || {};
      return {
        id: fieldName,
        logicalName: fieldName,
        name: fieldName,
        formField: fieldName,
        labels: DEFAULT_FIELD_LABELS[fieldName] || [fieldName],
        extraction: fieldName === 'dob' ? 'date' : 'text',
        strategy: comp.strategy || 'exactNormalizedString',
        threshold: comp.threshold,
        required: true
      };
    });
  }

  const normalizedFields = rawFields.map((field) => {
    const id = field.id || field.logicalName || field.field || field.name || 'field';
    const logicalName = field.logicalName || field.id || field.field || field.name;
    const name = field.name || field.logicalName || field.id || field.field || id;
    const formField = field.formField || field.id || field.logicalName || field.field || field.name;
    const rawStrategy = field.strategy || field.comparison || 'exactNormalizedString';
    const strategy = STRATEGY_ALIASES[rawStrategy] || rawStrategy;
    const labels = Array.isArray(field.labels) && field.labels.length > 0
      ? field.labels
      : (DEFAULT_FIELD_LABELS[id] || DEFAULT_FIELD_LABELS[logicalName] || [name, logicalName, id]);

    return {
      id,
      name,
      logicalName,
      formField,
      labels,
      extraction: field.extraction || (id === 'dob' || logicalName === 'dob' || strategy === 'exactNormalizedDate' ? 'date' : 'text'),
      strategy,
      comparison: strategy,
      threshold: typeof field.threshold === 'number' ? field.threshold : (strategy === 'fuzzyNormalized' ? 0.85 : undefined),
      required: field.required !== false
    };
  });

  return {
    documentType,
    displayName,
    documentStructure: schema.documentStructure || null,
    fields: normalizedFields,
    extract: normalizedFields.map((f) => f.id || f.logicalName),
    compare: normalizedFields.map((f) => ({
      field: f.id || f.logicalName,
      strategy: f.strategy,
      threshold: f.threshold
    })),
    fileRules: schema.fileRules || { allowedFormats: ['pdf', 'jpg', 'png'], maxSizeMB: 1 },
    qualityRules: schema.qualityRules || { minResolutionPx: 800, maxBlurScore: 50.0 }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeSchema,
    STRATEGY_ALIASES,
    DEFAULT_FIELD_LABELS
  };
} else if (typeof globalThis !== 'undefined') {
  globalThis.normalizeSchema = normalizeSchema;
  globalThis.STRATEGY_ALIASES = STRATEGY_ALIASES;
  globalThis.DEFAULT_FIELD_LABELS = DEFAULT_FIELD_LABELS;
}
