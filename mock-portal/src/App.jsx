import React, { useState } from 'react';
import ScholarshipForm from './components/ScholarshipForm';
import TestDataHelper from './components/TestDataHelper';

const INITIAL_FORM_STATE = {
  name: '',
  dob: '',
  gender: '',
  mobile: '',
  email: '',
  certificateNumber: '',
  documentType: '',
  certIssueDate: ''
};

export default function App() {
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);

  const handleApplyPreset = (presetData) => {
    setFormData(presetData);
  };

  const handleReset = () => {
    setFormData(INITIAL_FORM_STATE);
  };

  return (
    <div className="portal-root">
      {/* Top Official Bar */}
      <header className="gov-topbar">
        <div className="gov-topbar-left">
          <span className="emblem-pill">GOVT OF INDIA</span>
          <span>Ministry of Higher Education &amp; Skill Development</span>
        </div>
        <div>
          <span>Academic Year 2026-2027 • Application Window Open</span>
        </div>
      </header>

      {/* Main Portal Header */}
      <div className="portal-header">
        <div className="portal-header-content">
          <div className="portal-title-area">
            <div className="portal-logo-icon">🏛️</div>
            <div>
              <h1>National &amp; State Merit Scholarship Portal</h1>
              <p>Direct Benefit Transfer (DBT) Pre-Matric &amp; Post-Matric Scheme</p>
            </div>
          </div>
          <div className="portal-badge">
            <span className="dot"></span>
            <span>Mock Portal Active (Port 5173)</span>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <main className="app-container">
        {/* Helper Presets Toolbar for Phase 0 Verification */}
        <TestDataHelper onApplyPreset={handleApplyPreset} onReset={handleReset} />

        {/* Primary Scholarship Application Form */}
        <ScholarshipForm
          formData={formData}
          setFormData={setFormData}
          onReset={handleReset}
        />
      </main>

      {/* Footer */}
      <footer className="portal-footer">
        <p>© 2026 State Merit Scholarship Portal (SIH Prototype Development Environment).</p>
        <p style={{ marginTop: '4px', color: '#94a3b8' }}>
          Configured for Pre-Submission Error Guard Extension Testing.
        </p>
      </footer>
    </div>
  );
}
