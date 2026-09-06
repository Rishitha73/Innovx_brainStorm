// Pre-Submission Error Guard - Community Certificate Schema (Phase 8)
// Declarative validation schema for Caste / Community Certificate

const communityCertificateSchema = {
  documentType: 'communityCertificate',
  displayName: 'Community / Caste Certificate',
  fields: [
    {
      id: 'name',
      logicalName: 'name',
      name: 'Applicant Name',
      formField: 'name',
      labels: [
        'Applicant Name',
        'Candidate Name',
        'Name of Candidate',
        'Name of Applicant',
        'Applicant',
        'Candidate',
        'Name'
      ],
      extraction: 'text',
      strategy: 'fuzzyNormalized',
      comparison: 'fuzzy',
      threshold: 0.85,
      required: true
    },
    {
      id: 'certificateNumber',
      logicalName: 'certificateNumber',
      name: 'Certificate Number',
      formField: 'certificateNumber',
      labels: [
        'Certificate No',
        'Certificate Number',
        'Cert No',
        'Community Certificate No',
        'Caste Certificate No',
        'Cert ID',
        'Application No'
      ],
      extraction: 'text',
      strategy: 'exactNormalizedString',
      comparison: 'exact',
      required: true
    }
  ],
  extract: ['name', 'certificateNumber'],
  compare: [
    { field: 'name', strategy: 'fuzzyNormalized', threshold: 0.85 },
    { field: 'certificateNumber', strategy: 'exactNormalizedString' }
  ],
  fileRules: {
    allowedFormats: ['pdf', 'jpg', 'png'],
    maxSizeMB: 2
  },
  qualityRules: {
    minResolutionPx: 800,
    maxBlurScore: 50.0
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { communityCertificateSchema };
} else if (typeof globalThis !== 'undefined') {
  globalThis.communityCertificateSchema = communityCertificateSchema;
}
