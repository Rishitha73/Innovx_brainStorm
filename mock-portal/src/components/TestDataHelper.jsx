import React from 'react';

const TEST_PRESETS = [
  {
    label: 'Standard Valid Income Cert',
    data: {
      name: 'Rohan Sharma',
      dob: '2003-08-15',
      gender: 'Male',
      mobile: '9876543210',
      email: 'rohan.sharma@example.com',
      certificateNumber: 'INC-2024-98741',
      documentType: 'incomeCertificate',
      certIssueDate: '2024-03-15'
    }
  },
  {
    label: 'DOB Mismatch Variant',
    data: {
      name: 'Rohan Sharma',
      dob: '2004-12-25',
      gender: 'Male',
      mobile: '9876543210',
      email: '',
      certificateNumber: 'INC-2024-98741',
      documentType: 'incomeCertificate',
      certIssueDate: '2024-03-15'
    }
  },
  {
    label: 'Community Certificate Sample',
    data: {
      name: 'Ananya Verma',
      dob: '2002-04-10',
      gender: 'Female',
      mobile: '9123456780',
      email: 'ananya.verma@example.com',
      certificateNumber: 'COMM-2024-55412',
      documentType: 'communityCertificate',
      certIssueDate: '2024-01-20'
    }
  },
  {
    label: 'Residence Certificate Sample',
    data: {
      name: 'Kavita Patel',
      dob: '2001-11-30',
      gender: 'Female',
      mobile: '9988776655',
      email: '',
      certificateNumber: 'RES-2024-11234',
      documentType: 'residenceCertificate',
      certIssueDate: '2023-12-01'
    }
  },
  {
    label: 'Aadhaar Card Sample',
    data: {
      name: 'Rohan Sharma',
      dob: '2003-08-15',
      gender: 'Male',
      mobile: '9876543210',
      email: 'rohan.sharma@example.com',
      certificateNumber: '9876 5432 1098',
      documentType: 'aadhar',
      certIssueDate: '2023-05-12'
    }
  }
];

export default function TestDataHelper({ onApplyPreset, onReset }) {
  const attachSampleDocument = async (sampleType, filename) => {
    const canvas = document.createElement('canvas');
    let width = 1000, height = 800;
    if (sampleType === 'low-res') {
      width = 400;
      height = 300;
    }
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (sampleType === 'good') {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('GOVERNMENT OF STATE - INCOME CERTIFICATE', 120, 100);
      ctx.font = '20px sans-serif';
      ctx.fillText('Certificate No: INC-2024-98741', 120, 160);
      ctx.fillText('Applicant Name: Rohan Sharma', 120, 220);
      ctx.fillText('Date of Birth: 15-08-2003', 120, 280);
      ctx.fillText('Annual Income: Rs. 1,20,000 /-', 120, 340);
      ctx.fillText('Issuing Authority: Revenue Officer, North District', 120, 400);
      ctx.strokeStyle = '#1e3a8a';
      ctx.lineWidth = 4;
      ctx.strokeRect(60, 40, width - 120, height - 80);
    } else if (sampleType === 'aadhaar') {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('UNIQUE IDENTIFICATION AUTHORITY OF INDIA', 100, 90);
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('GOVERNMENT OF INDIA', 100, 130);
      ctx.font = '20px sans-serif';
      ctx.fillText('Name: Rohan Sharma', 100, 190);
      ctx.fillText('DOB: 15/08/2003', 100, 250);
      ctx.fillText('Gender: Male', 100, 310);
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText('Aadhaar No: 9876 5432 1098', 100, 380);
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 4;
      ctx.strokeRect(50, 40, width - 100, height - 80);
    } else if (sampleType === 'mismatch') {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('GOVERNMENT OF STATE - INCOME CERTIFICATE', 120, 100);
      ctx.font = '20px sans-serif';
      ctx.fillText('Certificate No: INC-2024-99999', 120, 160);
      ctx.fillText('Applicant Name: Priya Verma', 120, 220);
      ctx.fillText('Date of Birth: 15-08-2003', 120, 280);
      ctx.fillText('Annual Income: Rs. 1,50,000 /-', 120, 340);
      ctx.fillText('Issuing Authority: Revenue Officer, North District', 120, 400);
      ctx.strokeStyle = '#991b1b';
      ctx.lineWidth = 4;
      ctx.strokeRect(60, 40, width - 120, height - 80);
    } else if (sampleType === 'unrelated') {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('UNIDENTIFIED PUBLIC NOTICE / GENERAL MEMO', 120, 140);
      ctx.font = '18px sans-serif';
      ctx.fillText('This document contains official guidelines for portal submissions.', 120, 220);
      ctx.fillText('Annual Budget Estimate: Rs. 50,00,000', 120, 280);
      ctx.fillText('No applicant identification data is recorded here.', 120, 340);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 3;
      ctx.strokeRect(60, 40, width - 120, height - 80);
    } else if (sampleType === 'dob-mismatch') {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('GOVERNMENT OF STATE - INCOME CERTIFICATE', 120, 100);
      ctx.font = '20px sans-serif';
      ctx.fillText('Certificate No: INC-2024-98741', 120, 160);
      ctx.fillText('Applicant Name: Rohan Sharma', 120, 220);
      ctx.fillText('Date of Birth: 25-12-2004', 120, 280);
      ctx.fillText('Annual Income: Rs. 1,20,000 /-', 120, 340);
      ctx.strokeStyle = '#c2410c';
      ctx.lineWidth = 4;
      ctx.strokeRect(60, 40, width - 120, height - 80);
    } else if (sampleType === 'blurry') {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(0, 0, width, height);
      if (ctx.filter !== undefined) {
        ctx.filter = 'blur(14px)';
      }
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 36px sans-serif';
      ctx.fillText('INCOME CERTIFICATE (BLURRED SCAN)', 100, 200);
      ctx.fillText('Certificate No: INC-2024-98741', 100, 300);
      ctx.fillText('Applicant: Rohan Sharma', 100, 400);
    } else if (sampleType === 'low-res') {
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#0f172a';
      ctx.font = '14px sans-serif';
      ctx.fillText('Low Res Certificate (400x300)', 40, 60);
    } else if (sampleType === 'dark') {
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#1f2937';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText('Very Dark Document Scan', 100, 200);
    } else if (sampleType === 'cropped') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText('|||||||||||| CERTIFICATE NUMBER INC-2024-98741 ||||||||||||', 10, 15);
      ctx.font = '22px sans-serif';
      ctx.fillText('Rohan Sharma - DOB 15-08-2003', 10, 100);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 8;
      ctx.strokeRect(0, 0, width, height);
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], filename, { type: 'image/png' });
      const fileInput = document.getElementById('upload-certificate');
      if (fileInput) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, 'image/png');
  };

  return (
    <div className="test-preset-card" data-testid="test-data-helper">
      <div className="test-preset-header">
        <div className="test-preset-title">
          <span>⚡</span>
          <span>Quick Test Presets (Mock Development Data)</span>
        </div>
        <span className="test-preset-tag">Phase 7/8 Ready</span>
      </div>

      <div className="preset-buttons-grid">
        {TEST_PRESETS.map((preset, idx) => (
          <button
            key={idx}
            type="button"
            className="preset-btn"
            onClick={() => onApplyPreset(preset.data)}
            title={`Fill form with: ${preset.data.name} (${preset.data.documentType})`}
          >
            <span>📝</span> {preset.label}
          </button>
        ))}
        <button
          type="button"
          className="preset-btn btn-reset"
          onClick={onReset}
          title="Clear all fields"
        >
          <span>✕</span> Clear Form
        </button>
      </div>

      <div style={{ marginTop: '12px', borderTop: '1px dashed var(--color-border)', paddingTop: '10px' }}>
        <div style={{ fontSize: '0.76rem', fontWeight: '700', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
          <span>⚖️ Phase 7/8 Cross-Verification & OCR Fixtures:</span>
        </div>
        <div className="preset-buttons-grid">
          <button
            type="button"
            id="btn-sample-good"
            className="preset-btn"
            onClick={() => attachSampleDocument('good', 'income_certificate_matching.png')}
            title="Attach matching Income Certificate (Rohan Sharma, 15-08-2003, INC-2024-98741)"
          >
            <span>✅</span> Matching Doc (MATCH)
          </button>
          <button
            type="button"
            id="btn-sample-mismatch"
            className="preset-btn"
            onClick={() => attachSampleDocument('mismatch', 'income_certificate_mismatch.png')}
            title="Attach mismatching document (Priya Verma, INC-2024-99999)"
          >
            <span>❌</span> Mismatch Doc (MISMATCH)
          </button>
          <button
            type="button"
            id="btn-sample-unrelated"
            className="preset-btn"
            onClick={() => attachSampleDocument('unrelated', 'unrelated_document_scan.png')}
            title="Attach document with none of the expected fields (NEEDS REVIEW)"
          >
            <span>⚠️</span> Unrelated Doc (NEEDS REVIEW)
          </button>
          <button
            type="button"
            id="btn-sample-dob-mismatch"
            className="preset-btn"
            onClick={() => attachSampleDocument('dob-mismatch', 'dob_mismatch_certificate.png')}
            title="Attach document with DOB mismatch (25-12-2004)"
          >
            <span>📅</span> DOB Mismatch
          </button>
          <button
            type="button"
            id="btn-sample-aadhaar"
            className="preset-btn"
            onClick={() => attachSampleDocument('aadhaar', 'aadhaar_card_sample.png')}
            title="Attach matching Aadhaar Card (Rohan Sharma, 15/08/2003, 9876 5432 1098)"
          >
            <span>🆔</span> Aadhaar Doc (MATCH)
          </button>
        </div>
      </div>

      <div style={{ marginTop: '10px', borderTop: '1px dashed var(--color-border)', paddingTop: '8px' }}>
        <div style={{ fontSize: '0.74rem', fontWeight: '700', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
          <span>🔍 Phase 5 Document Quality Fixtures:</span>
        </div>
        <div className="preset-buttons-grid">
          <button
            type="button"
            id="btn-sample-blurry"
            className="preset-btn"
            onClick={() => attachSampleDocument('blurry', 'blurry_scan.png')}
            title="Attach a blurry scan"
          >
            <span>🌫️</span> Blurry Doc
          </button>
          <button
            type="button"
            id="btn-sample-lowres"
            className="preset-btn"
            onClick={() => attachSampleDocument('low-res', 'low_resolution_300px.png')}
            title="Attach a low-resolution image (<800px)"
          >
            <span>🔍</span> Low-Res Doc
          </button>
          <button
            type="button"
            id="btn-sample-dark"
            className="preset-btn"
            onClick={() => attachSampleDocument('dark', 'dark_underexposed.png')}
            title="Attach a very dark scan"
          >
            <span>🌑</span> Dark Doc
          </button>
          <button
            type="button"
            id="btn-sample-cropped"
            className="preset-btn"
            onClick={() => attachSampleDocument('cropped', 'cropped_edge_scan.png')}
            title="Attach a document with text touching page edge"
          >
            <span>✂️</span> Cropped Doc
          </button>
        </div>
      </div>
    </div>
  );
}
