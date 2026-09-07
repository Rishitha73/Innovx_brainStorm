// Pre-Submission Error Guard - Aadhaar Card Schema (Phase 8)
// Declarative validation schema for Aadhaar Identity Card

const aadhaarSchema = {
  documentType: 'aadhar',
  displayName: 'Aadhaar Card',
  aliases: ['aadharCard', 'aadhaar', 'aadhaarCard', 'aadhar-card', 'aadhaar-card'],
  fields: [
    {
      id: 'name',
      logicalName: 'name',
      name: 'Full Name',
      formField: 'name',
      labels: [
        'Applicant Name',
        'Full Name',
        'Citizen Name',
        'Citizen Full Name',
        'Name of Resident',
        'Resident Name',
        'Name of Applicant',
        'Candidate Name',
        'Name',
        'To'
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
        'DOB / Date of Birth',
        'D.O.B.',
        'Birth Date',
        'Date of Birth (DOB)',
        'Year of Birth',
        'YOB',
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
      name: 'Aadhaar / Certificate Number',
      formField: 'certificateNumber',
      labels: [
        'Aadhaar No',
        'Aadhaar Number',
        'Aadhar No',
        'Aadhar Number',
        'Aadhaar Card No',
        'Aadhaar',
        'Aadhar',
        'UID',
        'Unique Identification',
        'Unique Identification No',
        'Unique Identification Number',
        'VID',
        'Certificate No',
        'Certificate Number',
        'Cert No'
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
    maxSizeMB: 2
  },
  qualityRules: {
    minResolutionPx: 800,
    maxBlurScore: 50.0
  }
};

const aadharSchema = aadhaarSchema;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { aadhaarSchema, aadharSchema };
} else if (typeof globalThis !== 'undefined') {
  globalThis.aadhaarSchema = aadhaarSchema;
  globalThis.aadharSchema = aadharSchema;
}
