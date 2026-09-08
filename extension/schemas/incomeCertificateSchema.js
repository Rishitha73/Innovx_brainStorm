// Pre-Submission Error Guard - Income Certificate Schema (Phase 8)
// Declarative validation schema for Income Certificate

const incomeCertificateSchema = {
  documentType: 'incomeCertificate',
  displayName: 'Income Certificate',
  documentStructure: {
    anyText: [
      'income certificate',
      'annual income',
      'family income',
      'income and caste',
      'income',
      'revenue department',
      'revenue officer',
      'tehsildar',
      'tahsildar',
      'taluk office'
    ],
    requiredText: []
  },
  fields: [
    {
      id: 'name',
      logicalName: 'name',
      name: 'Full Name',
      formField: 'name',
      labels: [
        'Applicant Name',
        'Full Name',
        'Candidate Name',
        'Name of Applicant',
        'Name of Candidate',
        'Name of Student',
        'Citizen Full Name',
        'Citizen Name',
        'Student Name',
        'Applicant\'s Name',
        'Candidate\'s Name',
        'Student',
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
      id: 'dob',
      logicalName: 'dob',
      name: 'Date of Birth',
      formField: 'dob',
      labels: [
        'Date of Birth',
        'DOB',
        'D.O.B.',
        'Birth Date',
        'Date of Birth (DOB)',
        'Birthdate'
      ],
      extraction: 'date',
      strategy: 'exactNormalizedDate',
      comparison: 'exact-date',
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
        'Certificate ID',
        'Certificate Code',
        'Application No',
        'Application Number',
        'Registration No',
        'Registration Number',
        'Reg No',
        'Cert ID',
        'Cert. No.',
        'Cert. No'
      ],
      extraction: 'text',
      strategy: 'exactNormalizedString',
      comparison: 'exact',
      required: true
    }
  ],
  extract: ['name', 'dob', 'certificateNumber'],
  compare: [
    { field: 'name', strategy: 'fuzzyNormalized', threshold: 0.85 },
    { field: 'dob', strategy: 'exactNormalizedDate' },
    { field: 'certificateNumber', strategy: 'exactNormalizedString' }
  ],
  fileRules: {
    allowedFormats: ['pdf', 'jpg', 'png'],
    maxSizeMB: 1
  },
  qualityRules: {
    minResolutionPx: 800,
    maxBlurScore: 50.0
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { incomeCertificateSchema };
} else if (typeof globalThis !== 'undefined') {
  globalThis.incomeCertificateSchema = incomeCertificateSchema;
}
