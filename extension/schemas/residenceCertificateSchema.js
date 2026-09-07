// Pre-Submission Error Guard - Residence Certificate Schema (Phase 8)
// Declarative validation schema for Residence / Domicile Certificate

const residenceCertificateSchema = {
  documentType: 'residenceCertificate',
  displayName: 'Residence / Domicile Certificate',
  fields: [
    {
      id: 'name',
      logicalName: 'name',
      name: 'Applicant Name',
      formField: 'name',
      labels: [
        'Applicant Name',
        'Full Name',
        'Candidate Name',
        'Citizen Name',
        'Citizen Full Name',
        'Name of Applicant',
        'Name of Citizen',
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
      id: 'address',
      logicalName: 'address',
      name: 'Residential Address',
      formField: 'address',
      labels: [
        'Residential Address',
        'Permanent Address',
        'Address of Residence',
        'Current Address',
        'Address',
        'Residence'
      ],
      extraction: 'text',
      strategy: 'fuzzyNormalized',
      comparison: 'fuzzy',
      threshold: 0.70,
      required: true
    }
  ],
  extract: ['name', 'address'],
  compare: [
    { field: 'name', strategy: 'fuzzyNormalized', threshold: 0.85 },
    { field: 'address', strategy: 'fuzzyNormalized', threshold: 0.70 }
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
  module.exports = { residenceCertificateSchema };
} else if (typeof globalThis !== 'undefined') {
  globalThis.residenceCertificateSchema = residenceCertificateSchema;
}
