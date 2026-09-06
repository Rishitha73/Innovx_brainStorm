// Pre-Submission Error Guard - Popup Controller (Phase 5)
// Queries active tab status and renders Live Form State, Document Validation, Document Quality, and Selectors

document.addEventListener('DOMContentLoaded', () => {
  const loadingEl = document.getElementById('loading-state');
  const activeEl = document.getElementById('active-state');
  const inactiveEl = document.getElementById('inactive-state');

  const portalIdTag = document.getElementById('portal-id-tag');
  const portalNameDisplay = document.getElementById('portal-name-display');
  const selectorCountBadge = document.getElementById('selector-count-badge');
  const selectorsList = document.getElementById('selectors-list');
  const inactiveReason = document.getElementById('inactive-reason');

  // Form State Elements
  const valNameEl = document.getElementById('val-name');
  const valDobEl = document.getElementById('val-dob');
  const valCertEl = document.getElementById('val-cert');

  // Document State Elements (Phase 4)
  const docStatusBadge = document.getElementById('doc-status-badge');
  const noDocPlaceholder = document.getElementById('no-doc-placeholder');
  const docInfoBlock = document.getElementById('doc-info-block');
  const docFileName = document.getElementById('doc-file-name');
  const docFileType = document.getElementById('doc-file-type');
  const docFileSize = document.getElementById('doc-file-size');
  const docValidationBox = document.getElementById('doc-validation-box');
  const docValidationSummary = document.getElementById('doc-validation-summary');
  const docReasonsList = document.getElementById('doc-reasons-list');

  // Document Quality Elements (Phase 5)
  const qualitySection = document.getElementById('quality-section');
  const qualityStatusBadge = document.getElementById('quality-status-badge');
  const qualityProcessing = document.getElementById('quality-processing');
  const qualityMetricsBlock = document.getElementById('quality-metrics-block');
  const iconRes = document.getElementById('icon-res');
  const valRes = document.getElementById('val-res');
  const iconSharpness = document.getElementById('icon-sharpness');
  const valSharpness = document.getElementById('val-sharpness');
  const iconBrightness = document.getElementById('icon-brightness');
  const valBrightness = document.getElementById('val-brightness');
  const iconContrast = document.getElementById('icon-contrast');
  const valContrast = document.getElementById('val-contrast');
  const iconCropping = document.getElementById('icon-cropping');
  const valCropping = document.getElementById('val-cropping');
  const qualityResultBox = document.getElementById('quality-result-box');
  const qualityResultLine = document.getElementById('quality-result-line');
  const qualityReasonsList = document.getElementById('quality-reasons-list');

  // Document OCR Elements (Phase 6)
  const ocrSection = document.getElementById('ocr-section');
  const ocrStatusBadge = document.getElementById('ocr-status-badge');
  const ocrProcessing = document.getElementById('ocr-processing');
  const ocrContentBlock = document.getElementById('ocr-content-block');
  const ocrConfidenceVal = document.getElementById('ocr-confidence-val');
  const ocrTextDisplay = document.getElementById('ocr-text-display');
  const ocrFailureBox = document.getElementById('ocr-failure-box');
  const ocrReasonsList = document.getElementById('ocr-reasons-list');

  // Cross-Verification Elements (Phase 7)
  const verificationSection = document.getElementById('verification-section');
  const verificationOverallBadge = document.getElementById('verification-overall-badge');
  const verifProcessing = document.getElementById('verif-processing');
  const verifContentBlock = document.getElementById('verif-content-block');
  const verifOverallBox = document.getElementById('verif-overall-box');
  const verifOverallText = document.getElementById('verif-overall-text');
  const verifStatusName = document.getElementById('verif-status-name');
  const verifFormName = document.getElementById('verif-form-name');
  const verifDocName = document.getElementById('verif-doc-name');
  const verifStatusDob = document.getElementById('verif-status-dob');
  const verifFormDob = document.getElementById('verif-form-dob');
  const verifDocDob = document.getElementById('verif-doc-dob');
  const verifStatusCert = document.getElementById('verif-status-cert');
  const verifFormCert = document.getElementById('verif-form-cert');
  const verifDocCert = document.getElementById('verif-doc-cert');
  const verifReasonsBox = document.getElementById('verif-reasons-box');
  const verifReasonsList = document.getElementById('verif-reasons-list');

  function showLoading() {
    loadingEl.style.display = 'flex';
    activeEl.style.display = 'none';
    inactiveEl.style.display = 'none';
  }

  function renderActive(status) {
    loadingEl.style.display = 'none';
    inactiveEl.style.display = 'none';
    activeEl.style.display = 'block';

    const portalId = status.portalId || 'demo-scholarship-portal';
    portalIdTag.textContent = portalId;
    portalNameDisplay.textContent = portalId;

    // 1. Phase 3: Populate Live Form Values
    const fields = status.formFields || status.form || {};
    const extractVal = (field) => {
      if (!field) return '';
      if (typeof field === 'object' && field.value !== undefined) return field.value;
      if (typeof field === 'string') return field;
      return String(field);
    };
    const nameVal = extractVal(fields.name);
    const dobVal = extractVal(fields.dob);
    const certVal = extractVal(fields.certificateNumber || fields.certNumber);

    if (valNameEl) {
      valNameEl.textContent = nameVal || '(empty)';
      valNameEl.className = `field-value ${nameVal ? '' : 'empty'}`;
    }
    if (valDobEl) {
      valDobEl.textContent = dobVal || '(empty)';
      valDobEl.className = `field-value ${dobVal ? '' : 'empty'}`;
    }
    if (valCertEl) {
      valCertEl.textContent = certVal || '(empty)';
      valCertEl.className = `field-value ${certVal ? '' : 'empty'}`;
    }

    // 2. Phase 4: Populate Document File Validation Status
    const doc = status.document;
    const filePassed = Boolean(doc && doc.file && doc.fileValidation && doc.fileValidation.passed);

    if (doc && doc.file) {
      if (noDocPlaceholder) noDocPlaceholder.style.display = 'none';
      if (docInfoBlock) docInfoBlock.style.display = 'block';

      if (docFileName) docFileName.textContent = doc.file.name || 'unnamed';
      if (docFileType) docFileType.textContent = doc.file.mimeType || 'unknown';
      if (docFileSize) docFileSize.textContent = doc.file.formattedSize || `${doc.file.sizeBytes} B`;

      const reasons = (doc.fileValidation && Array.isArray(doc.fileValidation.reasons))
        ? doc.fileValidation.reasons
        : [];

      if (filePassed) {
        if (docStatusBadge) {
          docStatusBadge.textContent = 'VALID';
          docStatusBadge.className = 'doc-status-badge valid';
        }
        if (docValidationBox) {
          docValidationBox.className = 'doc-validation-box valid';
        }
        if (docValidationSummary) {
          docValidationSummary.textContent = '✓ File valid';
        }
        if (docReasonsList) docReasonsList.innerHTML = '';
      } else {
        if (docStatusBadge) {
          docStatusBadge.textContent = 'INVALID';
          docStatusBadge.className = 'doc-status-badge invalid';
        }
        if (docValidationBox) {
          docValidationBox.className = 'doc-validation-box invalid';
        }
        if (docValidationSummary) {
          docValidationSummary.textContent = '❌ File validation rejected';
        }
        if (docReasonsList) {
          docReasonsList.innerHTML = '';
          reasons.forEach((r) => {
            const reasonItem = document.createElement('div');
            reasonItem.textContent = r;
            docReasonsList.appendChild(reasonItem);
          });
        }
      }
    } else {
      if (noDocPlaceholder) noDocPlaceholder.style.display = 'block';
      if (docInfoBlock) docInfoBlock.style.display = 'none';
      if (docStatusBadge) {
        docStatusBadge.textContent = 'NO FILE';
        docStatusBadge.className = 'doc-status-badge none';
      }
    }

    // 3. Phase 5: Populate Document Quality Analysis Status
    if (qualitySection) {
      if (!filePassed || !doc || !doc.quality || doc.quality.status === 'not_run') {
        qualitySection.style.display = 'none';
      } else {
        qualitySection.style.display = 'block';
        const qState = doc.quality;

        if (qState.status === 'processing') {
          if (qualityProcessing) qualityProcessing.style.display = 'flex';
          if (qualityMetricsBlock) qualityMetricsBlock.style.display = 'none';
          if (qualityStatusBadge) {
            qualityStatusBadge.textContent = 'ANALYZING...';
            qualityStatusBadge.className = 'quality-status-badge processing';
          }
        } else if (qState.status === 'succeeded') {
          if (qualityProcessing) qualityProcessing.style.display = 'none';
          if (qualityMetricsBlock) qualityMetricsBlock.style.display = 'block';

          // Resolution
          if (qState.resolutionOk) {
            if (iconRes) { iconRes.textContent = '✓'; iconRes.className = 'metric-icon ok'; }
            if (valRes) valRes.textContent = 'Resolution OK';
          } else {
            if (iconRes) { iconRes.textContent = '❌'; iconRes.className = 'metric-icon fail'; }
            if (valRes) valRes.textContent = 'Resolution too low';
          }

          // Sharpness / Blur
          if (qState.blurScore !== null && qState.blurScore !== undefined) {
            const sharpOk = qState.blurScore >= 50.0;
            if (sharpOk) {
              if (iconSharpness) { iconSharpness.textContent = '✓'; iconSharpness.className = 'metric-icon ok'; }
              if (valSharpness) valSharpness.textContent = `Sharp (${qState.blurScore})`;
            } else {
              if (iconSharpness) { iconSharpness.textContent = '❌'; iconSharpness.className = 'metric-icon fail'; }
              if (valSharpness) valSharpness.textContent = `Blurry (${qState.blurScore})`;
            }
          }

          // Brightness
          if (qState.brightnessOk) {
            if (iconBrightness) { iconBrightness.textContent = '✓'; iconBrightness.className = 'metric-icon ok'; }
            if (valBrightness) valBrightness.textContent = 'Brightness OK';
          } else {
            if (iconBrightness) { iconBrightness.textContent = '❌'; iconBrightness.className = 'metric-icon fail'; }
            if (valBrightness) valBrightness.textContent = 'Unbalanced';
          }

          // Contrast
          if (qState.contrastOk) {
            if (iconContrast) { iconContrast.textContent = '✓'; iconContrast.className = 'metric-icon ok'; }
            if (valContrast) valContrast.textContent = 'Contrast OK';
          } else {
            if (iconContrast) { iconContrast.textContent = '❌'; iconContrast.className = 'metric-icon fail'; }
            if (valContrast) valContrast.textContent = 'Low contrast';
          }

          // Cropping
          if (qState.croppingOk) {
            if (iconCropping) { iconCropping.textContent = '✓'; iconCropping.className = 'metric-icon ok'; }
            if (valCropping) valCropping.textContent = 'Not obviously cropped';
          } else {
            if (iconCropping) { iconCropping.textContent = '⚠'; iconCropping.className = 'metric-icon warn'; }
            if (valCropping) valCropping.textContent = 'Possible cropping';
          }

          // Overall Quality Result Box
          if (qState.passed) {
            if (qualityStatusBadge) {
              qualityStatusBadge.textContent = 'PASS';
              qualityStatusBadge.className = 'quality-status-badge pass';
            }
            if (qualityResultBox) qualityResultBox.className = 'quality-result-box pass';
            if (qualityResultLine) qualityResultLine.textContent = 'QUALITY: PASS';
            if (qualityReasonsList) qualityReasonsList.innerHTML = '';
          } else {
            if (qualityStatusBadge) {
              qualityStatusBadge.textContent = 'WARNING';
              qualityStatusBadge.className = 'quality-status-badge warn';
            }
            if (qualityResultBox) qualityResultBox.className = 'quality-result-box warn';
            if (qualityResultLine) qualityResultLine.textContent = 'QUALITY: WARNING';
            if (qualityReasonsList) {
              qualityReasonsList.innerHTML = '';
              (qState.reasons || []).forEach((r) => {
                const item = document.createElement('div');
                item.textContent = r;
                qualityReasonsList.appendChild(item);
              });
            }
          }
        } else if (qState.status === 'failed') {
          if (qualityProcessing) qualityProcessing.style.display = 'none';
          if (qualityMetricsBlock) qualityMetricsBlock.style.display = 'block';
          if (qualityStatusBadge) {
            qualityStatusBadge.textContent = 'FAILED';
            qualityStatusBadge.className = 'quality-status-badge fail';
          }
          if (qualityResultBox) qualityResultBox.className = 'quality-result-box fail';
          if (qualityResultLine) qualityResultLine.textContent = 'QUALITY: FAILED';
          if (qualityReasonsList) {
            qualityReasonsList.innerHTML = '';
            (qState.reasons || ['Could not analyze this image.']).forEach((r) => {
              const item = document.createElement('div');
              item.textContent = r;
              qualityReasonsList.appendChild(item);
            });
          }
        }
      }
    }

    // 4. Phase 6: Populate Document OCR Status
    if (ocrSection) {
      if (!filePassed || !doc || !doc.ocr || doc.ocr.status === 'not_run') {
        ocrSection.style.display = 'none';
      } else {
        ocrSection.style.display = 'block';
        const ocrState = doc.ocr;

        if (ocrState.status === 'processing') {
          if (ocrProcessing) ocrProcessing.style.display = 'flex';
          if (ocrContentBlock) ocrContentBlock.style.display = 'none';
          if (ocrStatusBadge) {
            ocrStatusBadge.textContent = 'RECOGNIZING...';
            ocrStatusBadge.className = 'ocr-status-badge processing';
          }
        } else if (ocrState.status === 'succeeded') {
          if (ocrProcessing) ocrProcessing.style.display = 'none';
          if (ocrContentBlock) ocrContentBlock.style.display = 'block';
          if (ocrStatusBadge) {
            ocrStatusBadge.textContent = 'SUCCEEDED';
            ocrStatusBadge.className = 'ocr-status-badge succeeded';
          }

          // Confidence Pill
          const conf = typeof ocrState.confidence === 'number' ? Math.round(ocrState.confidence) : 0;
          if (ocrConfidenceVal) {
            ocrConfidenceVal.textContent = `${conf}%`;
            if (conf >= 75) {
              ocrConfidenceVal.className = 'ocr-confidence-pill high';
            } else if (conf >= 50) {
              ocrConfidenceVal.className = 'ocr-confidence-pill medium';
            } else {
              ocrConfidenceVal.className = 'ocr-confidence-pill low';
            }
          }

          // Extracted Text
          if (ocrTextDisplay) {
            ocrTextDisplay.textContent = ocrState.text && ocrState.text.trim()
              ? ocrState.text
              : '(No text detected in document)';
          }

          // OCR Warnings (e.g. low confidence warning)
          if (ocrFailureBox && ocrReasonsList) {
            if (ocrState.reasons && ocrState.reasons.length > 0) {
              ocrFailureBox.style.display = 'block';
              ocrReasonsList.innerHTML = '';
              ocrState.reasons.forEach((r) => {
                const item = document.createElement('div');
                item.textContent = r;
                ocrReasonsList.appendChild(item);
              });
            } else {
              ocrFailureBox.style.display = 'none';
            }
          }
        } else if (ocrState.status === 'failed') {
          if (ocrProcessing) ocrProcessing.style.display = 'none';
          if (ocrContentBlock) ocrContentBlock.style.display = 'block';
          if (ocrStatusBadge) {
            ocrStatusBadge.textContent = 'FAILED';
            ocrStatusBadge.className = 'ocr-status-badge failed';
          }
          if (ocrConfidenceVal) {
            ocrConfidenceVal.textContent = '0%';
            ocrConfidenceVal.className = 'ocr-confidence-pill low';
          }
          if (ocrTextDisplay) {
            ocrTextDisplay.textContent = '(OCR processing failed)';
          }
          if (ocrFailureBox && ocrReasonsList) {
            ocrFailureBox.style.display = 'block';
            ocrReasonsList.innerHTML = '';
            (ocrState.reasons || ['Could not extract text from document.']).forEach((r) => {
              const item = document.createElement('div');
              item.textContent = r;
              ocrReasonsList.appendChild(item);
            });
          }
        }
      }
    }

    // 5. Phase 7: Populate Cross-Verification Status
    if (verificationSection) {
      const verif = status.verification;
      const isDocPresent = Boolean(doc && doc.file);
      const isOcrProcessing = Boolean(doc && doc.ocr && doc.ocr.status === 'processing');
      const isOcrDone = Boolean(doc && doc.ocr && (doc.ocr.status === 'succeeded' || doc.ocr.status === 'failed'));
      const isVerifActive = Boolean(verif && (verif.status === 'completed' || verif.status === 'processing' || isOcrDone));

      if (!filePassed || !isDocPresent || !isVerifActive) {
        verificationSection.style.display = 'none';
      } else {
        verificationSection.style.display = 'block';

        if (verif.status === 'processing' || isOcrProcessing) {
          if (verifProcessing) verifProcessing.style.display = 'flex';
          if (verifContentBlock) verifContentBlock.style.display = 'none';
          if (verificationOverallBadge) {
            verificationOverallBadge.textContent = 'VERIFYING...';
            verificationOverallBadge.className = 'verification-status-badge processing';
          }
        } else {
          if (verifProcessing) verifProcessing.style.display = 'none';
          if (verifContentBlock) verifContentBlock.style.display = 'block';

          // Overall Status
          const overall = verif.overallStatus || 'NEEDS_REVIEW';
          const overallClass = overall.toLowerCase();
          const overallLabel = overall === 'NEEDS_REVIEW' ? 'NEEDS REVIEW' : overall;

          if (verificationOverallBadge) {
            verificationOverallBadge.textContent = overallLabel;
            verificationOverallBadge.className = `verification-status-badge ${overallClass}`;
          }
          if (verifOverallBox) {
            verifOverallBox.className = `verif-overall-box ${overallClass}`;
          }
          if (verifOverallText) {
            verifOverallText.textContent = overallLabel;
          }

          const vf = verif.fields || {};

          // Field 1: Name
          const nameF = vf.name || {};
          if (verifFormName) verifFormName.textContent = nameF.formValue || '(empty)';
          if (verifDocName) verifDocName.textContent = nameF.documentValue || 'Not found';
          if (verifStatusName) {
            const nStatus = nameF.status || 'NEEDS_REVIEW';
            verifStatusName.textContent = nStatus === 'NEEDS_REVIEW' ? 'NEEDS REVIEW' : nStatus;
            verifStatusName.className = `verif-pill ${nStatus.toLowerCase()}`;
          }

          // Field 2: Date of Birth
          const dobF = vf.dob || {};
          if (verifFormDob) verifFormDob.textContent = dobF.formValue || '(empty)';
          if (verifDocDob) verifDocDob.textContent = dobF.documentValue || 'Not found';
          if (verifStatusDob) {
            const dStatus = dobF.status || 'NEEDS_REVIEW';
            verifStatusDob.textContent = dStatus === 'NEEDS_REVIEW' ? 'NEEDS REVIEW' : dStatus;
            verifStatusDob.className = `verif-pill ${dStatus.toLowerCase()}`;
          }

          // Field 3: Certificate Number
          const certF = vf.certificateNumber || {};
          if (verifFormCert) verifFormCert.textContent = certF.formValue || '(empty)';
          if (verifDocCert) verifDocCert.textContent = certF.documentValue || 'Not found';
          if (verifStatusCert) {
            const cStatus = certF.status || 'NEEDS_REVIEW';
            verifStatusCert.textContent = cStatus === 'NEEDS_REVIEW' ? 'NEEDS REVIEW' : cStatus;
            verifStatusCert.className = `verif-pill ${cStatus.toLowerCase()}`;
          }

          // Reasons / Mismatch Callouts
          const verifReasons = verif.reasons || [];
          if (verifReasonsBox && verifReasonsList) {
            if (verifReasons.length > 0) {
              verifReasonsBox.style.display = 'block';
              verifReasonsList.innerHTML = '';
              verifReasons.forEach((r) => {
                const item = document.createElement('div');
                item.textContent = r;
                verifReasonsList.appendChild(item);
              });
            } else {
              verifReasonsBox.style.display = 'none';
            }
          }
        }
      }
    }

    // 6. Selectors list
    const totalSelectors = status.selectors ? status.selectors.length : 0;
    const foundCount = status.foundCount || 0;
    if (selectorCountBadge) selectorCountBadge.textContent = `${foundCount} / ${totalSelectors}`;

    if (selectorsList) {
      selectorsList.innerHTML = '';
      if (Array.isArray(status.selectors) && status.selectors.length > 0) {
        status.selectors.forEach((item) => {
          const itemEl = document.createElement('div');
          itemEl.className = `selector-item ${item.found ? 'found' : 'missing'}`;

          const nameSpan = document.createElement('span');
          nameSpan.className = 'selector-name';
          nameSpan.textContent = item.name || item.selector;

          const statusSpan = document.createElement('span');
          statusSpan.textContent = item.found ? `✓ ${item.selector}` : `⚠ ${item.selector} (Missing)`;

          itemEl.appendChild(nameSpan);
          itemEl.appendChild(statusSpan);
          selectorsList.appendChild(itemEl);
        });
      } else {
        selectorsList.innerHTML = '<div style="font-size:0.75rem; color:#94a3b8;">No selectors verified.</div>';
      }
    }
  }

  function renderInactive(reason) {
    loadingEl.style.display = 'none';
    activeEl.style.display = 'none';
    inactiveEl.style.display = 'block';

    if (inactiveReason && reason) {
      inactiveReason.textContent = reason;
    }
  }

  showLoading();

  if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.query) {
    renderInactive('Browser extension APIs unavailable in current view.');
    return;
  }

  function refreshPopupState(tabId, tabUrl) {
    chrome.tabs.sendMessage(tabId, { type: 'GET_DOCUMENT_STATE' }, (response) => {
      if (!chrome.runtime.lastError && response) {
        if (response.active) {
          renderActive(response);
        } else {
          renderInactive('The current tab is not a configured scholarship portal.');
        }
      } else {
        // Secondary: Ask background service worker for cached tab state
        chrome.runtime.sendMessage({ type: 'GET_TAB_STATUS', tabId }, (bgResponse) => {
          if (!chrome.runtime.lastError && bgResponse && bgResponse.active) {
            renderActive(bgResponse);
          } else {
            // Tertiary: Static URL match fallback
            const portalMatcher = (typeof matchPortal === 'function')
              ? matchPortal
              : (globalThis.matchPortal || null);

            const matched = portalMatcher ? portalMatcher(tabUrl) : null;
            if (matched) {
              renderActive({
                active: true,
                portalId: matched.portalId,
                portalName: matched.displayName,
                selectors: (typeof getAllConfiguredSelectors === 'function')
                  ? getAllConfiguredSelectors(matched).map((s) => ({ ...s, found: true }))
                  : [],
                foundCount: 7,
                formFields: {},
                document: {
                  file: null,
                  fileValidation: { passed: false, reasons: [] },
                  quality: { status: 'not_run', blurScore: null, resolutionOk: null, brightnessOk: null, contrastOk: null, croppingOk: null, passed: null, reasons: [] },
                  ocr: { status: 'not_run', text: '', confidence: 0, reasons: [] }
                },
                verification: {
                  status: 'idle',
                  overallStatus: null,
                  fields: {
                    name: { field: 'name', strategy: 'fuzzyNormalized', formValue: '', documentValue: null, status: 'NEEDS_REVIEW', score: null, reason: 'No file uploaded' },
                    dob: { field: 'dob', strategy: 'exactNormalizedDate', formValue: '', documentValue: null, status: 'NEEDS_REVIEW', reason: 'No file uploaded' },
                    certificateNumber: { field: 'certificateNumber', strategy: 'exactNormalizedString', formValue: '', documentValue: null, status: 'NEEDS_REVIEW', reason: 'No file uploaded' }
                  },
                  extractedFields: { name: null, dob: null, certificateNumber: null },
                  reasons: []
                }
              });
            } else {
              renderInactive(`Unsupported page: ${tabUrl || 'Non-web page'}`);
            }
          }
        });
      }
    });
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs && tabs[0];
    if (!activeTab || !activeTab.id) {
      renderInactive('No active tab detected.');
      return;
    }

    const tabUrl = activeTab.url || '';
    refreshPopupState(activeTab.id, tabUrl);

    // Listen for live updates from content script while popup is open
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && (msg.type === 'FORM_FIELD_CHANGED' || msg.type === 'FILE_VALIDATED' || msg.type === 'CONTENT_SCRIPT_LOADED')) {
        refreshPopupState(activeTab.id, tabUrl);
      }
    });
  });
});
