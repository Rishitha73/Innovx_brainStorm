// Pre-Submission Error Guard - Custom in-page sidebar

const SIDEBAR_STYLE = `
:host { all: initial; }
.guard-launcher { position: fixed; top: 50%; right: 0; z-index: 2147483647; width: 42px; height: 52px; border: 1px solid #b8d7c5; border-right: 0; border-radius: 10px 0 0 10px; color: #ffffff; background: #16734d; box-shadow: -3px 4px 14px rgba(23, 33, 27, .2); cursor: pointer; transform: translateY(-50%); transition: opacity 200ms ease, transform 240ms ease; font: 21px/1 "Segoe UI Emoji", "Segoe UI", sans-serif; }
.guard-launcher:hover, .guard-launcher:focus-visible { background: #105b3c; outline: 2px solid #b8d7c5; outline-offset: 2px; }
.guard-launcher.hidden { opacity: 0; pointer-events: none; transform: translate(100%, -50%); }
.guard-sidebar { position: fixed; inset: 0 0 0 auto; z-index: 2147483647; width: 360px; max-width: 92vw; box-sizing: border-box; overflow-y: auto; transform: translateX(100%); transition: transform 240ms ease; background: #f7faf7; color: #17211b; font: 14px/1.45 "Segoe UI", sans-serif; box-shadow: -12px 0 30px rgba(23, 33, 27, .18); }
.guard-sidebar.open { transform: translateX(0); }
.guard-sidebar *, .guard-sidebar *::before, .guard-sidebar *::after { box-sizing: border-box; }
.guard-panel { padding: 22px 18px; }
.guard-header { border-bottom: 1px solid #dce5df; padding-bottom: 18px; }
.guard-eyebrow { color: #16734d; font-size: 10px; font-weight: 700; letter-spacing: .14em; }
.guard-title-row { display: flex; align-items: start; gap: 12px; }
.guard-title { flex: 1; min-width: 0; margin: 7px 0 8px; font-size: 21px; line-height: 1.15; font-weight: 700; }
.guard-close { flex: 0 0 auto; border: 0; padding: 5px 7px; color: #68756d; background: transparent; cursor: pointer; font: 22px/1 "Segoe UI", sans-serif; }
.guard-close:hover, .guard-close:focus-visible { color: #17211b; background: #e5f3eb; outline: none; }
.guard-status { margin: 0; font-weight: 700; }
.guard-checking, .guard-inactive { color: #68756d; }
.guard-ready { color: #16734d; }
.guard-warning { color: #9a5b08; }
.guard-section { padding-top: 22px; }
.guard-section-heading { display: flex; align-items: center; justify-content: space-between; }
.guard-heading { margin: 0 0 10px; font-size: 14px; }
.guard-count { color: #9a5b08; font-weight: 700; }
.guard-list { display: grid; gap: 9px; margin: 0; padding: 0; list-style: none; }
.guard-issue { display: grid; gap: 7px; padding: 11px 12px; border-left: 3px solid #d28a20; background: #fff2dc; }
.guard-issue strong { font-size: 13px; }
.guard-issue span { color: #5d4a2d; font-size: 12px; }
.guard-edit { justify-self: start; border: 1px solid #c89137; border-radius: 5px; padding: 4px 8px; color: #754607; background: #fffaf0; cursor: pointer; font: 600 11px/1.2 "Segoe UI", sans-serif; }
.guard-edit:hover, .guard-edit:focus-visible { color: #ffffff; background: #9a5b08; outline: none; }
.guard-good { margin-top: 22px; border-top: 1px solid #dce5df; padding-top: 15px; }
.guard-good summary { display: flex; justify-content: space-between; cursor: pointer; color: #16734d; font-weight: 700; }
.guard-good-list { margin-top: 13px; color: #68756d; font-size: 12px; }
.guard-empty { margin: 28px 0 0; color: #68756d; }
`;

function concatBytes(chunks) {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
}

class SidebarUI {
  constructor() {
    this.host = null;
    this.root = null;
    this.sidebar = null;
    this.launcher = null;
    this.open = false;
    this.elements = {};
  }

  initialize() {
    if (typeof document === 'undefined') return;
    this.cleanup();

    this.host = document.createElement('div');
    this.host.id = 'guard-custom-sidebar-host';
    this.root = this.host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = SIDEBAR_STYLE;
    this.root.appendChild(style);

    this.sidebar = document.createElement('aside');
    this.sidebar.className = 'guard-sidebar';
    this.sidebar.setAttribute('aria-label', 'Pre-Submission Error Guard');
    this.sidebar.setAttribute('aria-hidden', 'true');
    this.sidebar.innerHTML = `
      <div class="guard-panel">
        <header class="guard-header">
          <div class="guard-eyebrow">FORM GUARD</div>
          <div class="guard-title-row">
            <h2 class="guard-title"></h2>
            <button class="guard-close" type="button" aria-label="Close form guard sidebar">✕</button>
          </div>
          <p class="guard-status guard-checking"></p>
        </header>
        <section class="guard-section guard-issues-section" hidden>
          <div class="guard-section-heading"><h3 class="guard-heading">Fields to fix</h3><span class="guard-count"></span></div>
          <ul class="guard-list guard-issues-list"></ul>
        </section>
        <details class="guard-good" hidden>
          <summary><span>Looks good</span><span class="guard-good-summary"></span></summary>
          <ul class="guard-list guard-good-list"></ul>
        </details>
        <p class="guard-empty" hidden>No form detected on this page.</p>
      </div>
    `;
    this.launcher = document.createElement('button');
    this.launcher.className = 'guard-launcher';
    this.launcher.type = 'button';
    this.launcher.setAttribute('aria-label', 'Open Pre-Submission Error Guard');
    this.launcher.textContent = '🛡️';
    this.launcher.addEventListener('click', () => this.toggle());
    this.root.appendChild(this.launcher);
    this.root.appendChild(this.sidebar);
    document.documentElement.appendChild(this.host);

    this.elements = {
      title: this.sidebar.querySelector('.guard-title'),
      status: this.sidebar.querySelector('.guard-status'),
      issuesSection: this.sidebar.querySelector('.guard-issues-section'),
      count: this.sidebar.querySelector('.guard-count'),
      issuesList: this.sidebar.querySelector('.guard-issues-list'),
      good: this.sidebar.querySelector('.guard-good'),
      goodSummary: this.sidebar.querySelector('.guard-good-summary'),
      goodList: this.sidebar.querySelector('.guard-good-list'),
      empty: this.sidebar.querySelector('.guard-empty')
    };
    this.sidebar.querySelector('.guard-close').addEventListener('click', () => this.close());
  }

  cleanup() {
    if (this.host) this.host.remove();
    this.host = null;
    this.root = null;
    this.sidebar = null;
    this.launcher = null;
    this.open = false;
  }

  isOpen() {
    return this.open;
  }

  toggle() {
    if (!this.sidebar) return;
    if (this.open) this.close();
    else this.openSidebar();
  }

  openSidebar() {
    this.open = true;
    this.sidebar.classList.add('open');
    this.sidebar.setAttribute('aria-hidden', 'false');
    this.launcher.classList.add('hidden');
  }

  close() {
    if (!this.sidebar) return;
    this.open = false;
    this.sidebar.classList.remove('open');
    this.sidebar.setAttribute('aria-hidden', 'true');
    this.launcher.classList.remove('hidden');
  }

  labelFor(field) {
    const labels = {
      name: 'Full Name',
      dob: 'Date of Birth',
      certificateNumber: 'Certificate Number',
      address: 'Address',
      documentUpload: 'Certificate Document'
    };
    return labels[field] || String(field).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (character) => character.toUpperCase());
  }

  getIssues(status) {
    const issues = [];
    const verification = status.verification || {};
    const documentState = status.document || {};
    const selectedFile = document.querySelector('input[type="file"]')?.files?.[0] || null;
    const fields = verification.fields || {};
    const documentProcessing = documentState.quality?.status === 'processing' || documentState.ocr?.status === 'processing' || verification.status === 'processing';

    if (documentState.file && !documentProcessing) {
      const seen = new Set();
      Object.entries(fields).forEach(([field, result]) => {
        const fieldKey = result?.field || field;
        if (seen.has(fieldKey)) return;
        seen.add(fieldKey);
        if ((result?.status === 'MISMATCH' || result?.status === 'NEEDS_REVIEW') && result.reason) {
          issues.push({ field: fieldKey, label: this.labelFor(fieldKey), reason: result.reason, documentValue: result.documentValue });
        }
      });
    }
    if (documentState.file && documentState.fileValidation && !documentState.fileValidation.passed && documentState.fileValidation.reasons?.[0]) {
      issues.push({ field: 'documentUpload', label: 'Certificate Document', reason: documentState.fileValidation.reasons[0] });
    }
    if (selectedFile?.size > 1 * 1024 * 1024 && !issues.some((issue) => issue.reason?.includes('File too large'))) {
      issues.push({
        field: 'documentUpload',
        label: 'Certificate Document',
        reason: `File too large. Maximum size is 1 MB. Selected file is ${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB.`
      });
    }
    const documentTypeIsInvalid = (
      verification.documentTypeCheck?.status === 'MISMATCH' ||
      (verification.documentTypeCheck?.status === 'NEEDS_REVIEW' && verification.documentTypeCheck.manualReviewApproved !== true)
    );
    if (!documentTypeIsInvalid && documentState.quality?.status === 'succeeded' && !documentState.quality.passed && documentState.quality.reasons?.[0]) {
      issues.push({ field: 'documentUpload', label: 'Certificate Document', reason: documentState.quality.reasons[0] });
    }
    if (documentState.ocr?.status === 'failed' && documentState.ocr.reasons?.[0]) {
      issues.push({ field: 'documentUpload', label: 'Certificate Document', reason: documentState.ocr.reasons[0] });
    }
    if (verification.documentTypeCheck?.status === 'MISMATCH' ||
      (verification.documentTypeCheck?.status === 'NEEDS_REVIEW' && verification.documentTypeCheck.manualReviewApproved !== true)) {
      issues.push({ field: 'documentUpload', label: 'Certificate Document', reason: verification.documentTypeCheck.reason });
    }
    return issues;
  }

  getGoodFields(status) {
    const fields = status.verification?.fields || {};
    const good = [];
    const seen = new Set();
    Object.entries(fields).forEach(([field, result]) => {
      const fieldKey = result?.field || field;
      if (seen.has(fieldKey)) return;
      seen.add(fieldKey);
      if (result?.status === 'MATCH' || result?.status === 'PASS') good.push(this.labelFor(fieldKey));
    });
    return good;
  }

  focusFormField(field) {
    const selectors = {
      name: '#applicant-name, [name="name"], [autocomplete="name"]',
      dob: '#applicant-dob, [name="dob"], [name="dateOfBirth"], [autocomplete="bday"]',
      certificateNumber: '#cert-number, #cert-num, [name="certificateNumber"], [name="certificateNo"], [name="aadhaar"]',
      documentUpload: 'input[type="file"]'
    };
    const element = document.querySelector(selectors[field] || '');
    if (!element) return;
    this.close();
    element.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    element.focus({ preventScroll: true });
  }

  fillFormField(field, value) {
    if (value === null || value === undefined || String(value).trim() === '') return;
    const selectors = {
      name: '#applicant-name, [name="name"], [autocomplete="name"]',
      dob: '#applicant-dob, [name="dob"], [name="dateOfBirth"], [autocomplete="bday"]',
      certificateNumber: '#cert-number, #cert-num, [name="certificateNumber"], [name="certificateNo"], [name="aadhaar"]',
      address: '#address, [name="address"], [autocomplete="street-address"]'
    };
    const element = document.querySelector(selectors[field] || '');
    if (!element) return;

    let nextValue = String(value).trim();
    if (field === 'dob' && element.type === 'date') {
      const dateMatch = nextValue.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
      if (dateMatch) nextValue = `${dateMatch[3]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}`;
    }
    element.value = nextValue;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    element.focus({ preventScroll: true });
  }

  getTrustedCompressorUrl(file) {
    if (file?.type?.includes('pdf') || file?.name?.toLowerCase().endsWith('.pdf')) {
      return 'https://www.pdf2go.com/compress-pdf';
    }
    if (file?.type?.startsWith('image/')) {
      return 'https://imagecompressor.11zon.com/en/';
    }
    return null;
  }

  getCompressorInstruction(file) {
    const docType = document.querySelector('#document-type')?.value;
    const isPdf = file?.type?.includes('pdf') || file?.name?.toLowerCase().endsWith('.pdf');
    if (isPdf && (docType === 'aadhar' || docType === 'aadhaar' || docType === 'aadharCard')) {
      return 'The PDF may have encryption or usage restrictions even if it does not ask for a password. Open it locally and use Print > Save as PDF to create a fresh copy, or upload the original Aadhaar image. Then select the new file here.';
    }
      return 'Set the target size to 1 MB, download the result, then select the new file here.';
  }

  async compressOversizedImage() {
    const input = document.querySelector('input[type="file"]');
    const sourceFile = input?.files?.[0];
    if (!input || !sourceFile || !sourceFile.type.startsWith('image/')) return false;

    const image = new Image();
    const objectUrl = URL.createObjectURL(sourceFile);
    const compressedFile = await new Promise((resolve, reject) => {
      image.onload = async () => {
        try {
          let longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
          let result = null;
          for (let attempt = 0; attempt < 6; attempt++) {
            const scale = Math.min(1, longestEdge / Math.max(image.naturalWidth, image.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
            let lowQuality = 0.65;
            let highQuality = 0.96;
            let bestBlob = null;
            for (let qualityAttempt = 0; qualityAttempt < 6; qualityAttempt++) {
              const quality = (lowQuality + highQuality) / 2;
              const blob = await new Promise((blobResolve) => canvas.toBlob(blobResolve, 'image/jpeg', quality));
              if (!blob) throw new Error('Could not encode the image.');
                if (blob.size <= 1 * 1024 * 1024) {
                bestBlob = blob;
                lowQuality = quality;
              } else {
                highQuality = quality;
              }
            }
            if (bestBlob) {
              result = bestBlob;
              break;
            }
            longestEdge = Math.round(longestEdge * 0.9);
          }
          if (!result) throw new Error('This image cannot reach 1 MB without losing significant detail.');
          const baseName = sourceFile.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '_');
          resolve(new File([result], `${baseName}_compressed.jpg`, { type: 'image/jpeg' }));
        } catch (error) {
          reject(error);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Could not read the image.'));
      };
      image.src = objectUrl;
    });

      if (compressedFile.size > 1 * 1024 * 1024) return false;
    if (typeof DataTransfer === 'undefined') return false;
    const transfer = new DataTransfer();
    transfer.items.add(compressedFile);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  async compressOversizedPdf() {
    const input = document.querySelector('input[type="file"]');
    const sourceFile = input?.files?.[0];
    const pdfjs = globalThis.pdfjsLib;
    if (!input || !sourceFile || !sourceFile.type.includes('pdf') || !pdfjs?.getDocument) return false;

    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await sourceFile.arrayBuffer()) }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.15 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.78));
      if (!blob) return false;
      pages.push({ bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height });
    }

    const encoder = new TextEncoder();
    const objectBytes = [];
    const addObject = (body) => {
      objectBytes.push(typeof body === 'string' ? encoder.encode(body) : body);
      return objectBytes.length;
    };
    const catalogId = addObject('<< /Type /Catalog /Pages 2 0 R >>');
    const pagesId = addObject('');
    const pageIds = [];
    pages.forEach((page) => {
      const pageId = objectBytes.length + 1;
      const contentId = pageId + 1;
      const imageId = pageId + 2;
      const content = `q ${page.width} 0 0 ${page.height} 0 0 cm /Im0 Do Q`;
      pageIds.push(pageId);
      addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
      addObject(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      addObject({ image: page.bytes, width: page.width, height: page.height });
    });
    objectBytes[pagesId - 1] = encoder.encode(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);

    const chunks = [encoder.encode('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n')];
    const offsets = [0];
    let offset = chunks[0].length;
    objectBytes.forEach((body, index) => {
      offsets.push(offset);
      const objectHeader = encoder.encode(`${index + 1} 0 obj\n`);
      const objectBody = body?.image
        ? concatBytes([
          encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${body.width} /Height ${body.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${body.image.length} >>\nstream\n`),
          body.image,
          encoder.encode('\nendstream')
        ])
        : body;
      const objectChunk = concatBytes([objectHeader, objectBody, encoder.encode('\nendobj\n')]);
      chunks.push(objectChunk);
      offset += objectChunk.length;
    });
    const xrefOffset = offset;
    chunks.push(encoder.encode(`xref\n0 ${objectBytes.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((value) => `${String(value).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objectBytes.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));
    const compressedBytes = concatBytes(chunks);
      if (compressedBytes.length > 1 * 1024 * 1024) return false;

    const baseName = sourceFile.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '_');
    const compressedFile = new File([compressedBytes], `${baseName}_compressed.pdf`, { type: 'application/pdf' });
    const transfer = new DataTransfer();
    transfer.items.add(compressedFile);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  approveManualReview() {
    document.dispatchEvent(new CustomEvent('guard-manual-review-approved', { bubbles: true }));
  }

  render(status) {
    if (!this.sidebar || !status) return;
    const active = Boolean(status.active);
    this.elements.title.textContent = active ? (status.portalName || 'Supported portal') : 'Pre-Submission Error Guard';
    this.elements.empty.hidden = active;
    if (!active) {
      this.elements.status.textContent = 'No form detected on this page';
      this.elements.status.className = 'guard-status guard-inactive';
      this.elements.issuesSection.hidden = true;
      this.elements.good.hidden = true;
      return;
    }

    const verification = status.verification || {};
    const documentState = status.document || {};
    const hasSelectedFile = Boolean(documentState.file || document.querySelector('input[type="file"]')?.files?.[0]);
    const checking = verification.status === 'processing' || documentState.quality?.status === 'processing' ||
      documentState.ocr?.status === 'processing' || verification.overallStatus === 'WAITING_FOR_TYPE' ||
      verification.status === 'waiting_for_schema' || !hasSelectedFile;
    const issues = checking ? [] : this.getIssues(status);
    const goodFields = this.getGoodFields(status);
    const totalFields = new Set(Object.values(verification.fields || {}).map((result) => result?.field).filter(Boolean)).size;

    this.elements.status.textContent = checking ? '⏳ Checking...' : issues.length
      ? `⚠️ ${issues.length} issue${issues.length === 1 ? '' : 's'} to fix`
      : '✅ Ready to submit';
    this.elements.status.className = `guard-status ${checking ? 'guard-checking' : issues.length ? 'guard-warning' : 'guard-ready'}`;
    this.elements.issuesSection.hidden = issues.length === 0;
    this.elements.count.textContent = issues.length ? String(issues.length) : '';
    const extractedFields = verification.extractedFields || {};
    this.elements.issuesList.replaceChildren(...issues.map(({ field, label, reason, documentValue }) => {
      const item = document.createElement('li');
      item.className = 'guard-issue';
      const labelElement = document.createElement('strong');
      labelElement.textContent = label;
      const reasonElement = document.createElement('span');
      reasonElement.textContent = reason;
      const extractedValue = extractedFields[field] || documentValue;
      const selectedFile = document.querySelector('input[type="file"]')?.files?.[0];
      const compressorUrl = field === 'documentUpload' && selectedFile?.size > 1 * 1024 * 1024
        ? this.getTrustedCompressorUrl(selectedFile)
        : null;
      const documentTypeStatus = verification.documentTypeCheck?.status;
      const documentTypeIsInvalid = documentTypeStatus === 'MISMATCH' ||
        (documentTypeStatus === 'NEEDS_REVIEW' && verification.documentTypeCheck?.manualReviewApproved !== true);
      const canAutofill = field !== 'documentUpload' && !documentTypeIsInvalid && Boolean(extractedValue);
      const canApproveManualReview = field === 'documentUpload' && documentTypeStatus === 'NEEDS_REVIEW';
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'guard-edit';
      editButton.textContent = canAutofill
        ? 'Fill correct details'
        : canApproveManualReview
          ? 'Continue after manual review'
          : 'Edit in form';
      editButton.addEventListener('click', () => {
        if (canAutofill) this.fillFormField(field, extractedValue);
        else if (canApproveManualReview) this.approveManualReview();
        else this.focusFormField(field);
      });
      item.append(labelElement, reasonElement, editButton);
      if (compressorUrl) {
        const compressorLink = document.createElement('a');
        compressorLink.className = 'guard-edit';
        compressorLink.href = compressorUrl;
        compressorLink.target = '_blank';
        compressorLink.rel = 'noopener noreferrer';
        compressorLink.textContent = 'Open target-size compressor';
        compressorLink.title = 'Download the compressed file, then choose it again in this form.';
        item.append(compressorLink);
        const compressorNote = document.createElement('small');
        compressorNote.textContent = this.getCompressorInstruction(selectedFile);
        item.append(compressorNote);
      }
      return item;
    }));
    this.elements.good.hidden = goodFields.length === 0;
    this.elements.goodSummary.textContent = `${goodFields.length} of ${totalFields} fields verified ✅`;
    this.elements.goodList.replaceChildren(...goodFields.map((label) => {
      const item = document.createElement('li');
      item.textContent = label;
      return item;
    }));
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SidebarUI;
} else if (typeof globalThis !== 'undefined') {
  globalThis.SidebarUI = SidebarUI;
}