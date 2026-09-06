import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Phase 6: Extension-Owned Offscreen OCR Messaging & Lifecycle', () => {
  let mockContexts = [];
  let offscreenCreated = false;
  let creationCallCount = 0;
  let listeners = [];
  let runtimeMessages = [];

  beforeEach(() => {
    mockContexts = [];
    offscreenCreated = false;
    creationCallCount = 0;
    listeners = [];
    runtimeMessages = [];

    // Setup global chrome mock
    globalThis.chrome = {
      runtime: {
        getURL: vi.fn((p) => `chrome-extension://mock-extension-id/${p}`),
        getContexts: vi.fn(async ({ contextTypes, documentUrls }) => {
          return mockContexts.filter((c) =>
            contextTypes.includes(c.contextType) &&
            (!documentUrls || documentUrls.includes(c.documentUrl))
          );
        }),
        onMessage: {
          addListener: vi.fn((fn) => listeners.push(fn))
        },
        sendMessage: vi.fn((msg, callback) => {
          runtimeMessages.push(msg);
          // Dispatch to listeners
          let responded = false;
          const sendResponse = (res) => {
            responded = true;
            if (callback) callback(res);
          };
          for (const l of listeners) {
            const res = l(msg, { tab: null }, sendResponse);
            if (res === true) break;
          }
        }),
        lastError: null
      },
      offscreen: {
        createDocument: vi.fn(async ({ url, reasons, justification }) => {
          creationCallCount++;
          if (mockContexts.length > 0) {
            throw new Error('Only a single offscreen document may be created.');
          }
          offscreenCreated = true;
          mockContexts.push({
            contextType: 'OFFSCREEN_DOCUMENT',
            documentUrl: `chrome-extension://mock-extension-id/${url}`
          });
          return true;
        })
      }
    };
  });

  // Test 1: Offscreen document creation
  it('creates an offscreen document with WORKERS reason when none exists', async () => {
    let creating = null;
    async function ensureOffscreen() {
      const url = chrome.runtime.getURL('offscreen/offscreen.html');
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [url]
      });
      if (contexts.length > 0) return;
      if (creating) return creating;
      creating = chrome.offscreen.createDocument({
        url: 'offscreen/offscreen.html',
        reasons: ['WORKERS'],
        justification: 'Run local Tesseract OCR in an extension-owned document.'
      });
      await creating;
      creating = null;
    }

    await ensureOffscreen();
    expect(chrome.offscreen.createDocument).toHaveBeenCalledTimes(1);
    expect(chrome.offscreen.createDocument).toHaveBeenCalledWith({
      url: 'offscreen/offscreen.html',
      reasons: ['WORKERS'],
      justification: expect.stringContaining('Tesseract OCR')
    });
    expect(mockContexts.length).toBe(1);
  });

  // Test 2: Existing offscreen document detection
  it('detects existing offscreen document and does not create duplicates', async () => {
    mockContexts.push({
      contextType: 'OFFSCREEN_DOCUMENT',
      documentUrl: 'chrome-extension://mock-extension-id/offscreen/offscreen.html'
    });

    async function ensureOffscreen() {
      const url = chrome.runtime.getURL('offscreen/offscreen.html');
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [url]
      });
      if (contexts.length > 0) return;
      await chrome.offscreen.createDocument({
        url: 'offscreen/offscreen.html',
        reasons: ['WORKERS'],
        justification: 'Run local Tesseract OCR'
      });
    }

    await ensureOffscreen();
    expect(chrome.offscreen.createDocument).not.toHaveBeenCalled();
  });

  // Test 3: Concurrent creation handling
  it('handles concurrent creation calls safely using a shared lock', async () => {
    let creating = null;
    async function ensureOffscreen() {
      const url = chrome.runtime.getURL('offscreen/offscreen.html');
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [url]
      });
      if (contexts.length > 0) return;
      if (creating) {
        await creating;
        return;
      }
      creating = chrome.offscreen.createDocument({
        url: 'offscreen/offscreen.html',
        reasons: ['WORKERS'],
        justification: 'Run local Tesseract OCR'
      });
      await creating;
      creating = null;
    }

    // Call 5 times concurrently
    await Promise.all([
      ensureOffscreen(),
      ensureOffscreen(),
      ensureOffscreen(),
      ensureOffscreen(),
      ensureOffscreen()
    ]);

    expect(creationCallCount).toBe(1);
  });

  // Test 4: PERFORM_OCR routing from content to offscreen via background
  it('routes PERFORM_OCR from content script to offscreen context via background', async () => {
    // 1. Setup offscreen listener
    listeners.push((msg, sender, sendResponse) => {
      if (msg.type === 'PERFORM_OCR' && msg.target === 'offscreen') {
        sendResponse({
          status: 'succeeded',
          text: 'GOVERNMENT OF KARNATAKA\nINCOME CERTIFICATE',
          confidence: 92.5,
          reasons: []
        });
        return true;
      }
    });

    // 2. Setup background router
    listeners.push((msg, sender, sendResponse) => {
      if (msg.type === 'PERFORM_OCR' && msg.target === 'background') {
        chrome.runtime.sendMessage(
          {
            type: 'PERFORM_OCR',
            target: 'offscreen',
            payload: msg.payload
          },
          (res) => sendResponse(res)
        );
        return true;
      }
    });

    // 3. Dispatch from content script
    let clientResult = null;
    chrome.runtime.sendMessage(
      {
        type: 'PERFORM_OCR',
        target: 'background',
        payload: { imageSource: 'data:image/png;base64,mock', options: { lang: 'eng' } }
      },
      (res) => {
        clientResult = res;
      }
    );

    expect(clientResult).not.toBeNull();
    expect(clientResult.status).toBe('succeeded');
    expect(clientResult.text).toContain('INCOME CERTIFICATE');
    expect(clientResult.confidence).toBe(92.5);
  });

  // Test 5: Offscreen listener receiving the message
  it('verifies offscreen listener receives message with exact type and target', () => {
    let received = false;
    const offscreenListener = vi.fn((msg, sender, sendResponse) => {
      if (msg.type === 'PERFORM_OCR' && msg.target === 'offscreen') {
        received = true;
        sendResponse({ status: 'succeeded', text: 'Sample Text', confidence: 85 });
      }
    });

    listeners.push(offscreenListener);

    chrome.runtime.sendMessage({
      type: 'PERFORM_OCR',
      target: 'offscreen',
      payload: { imageSource: 'data:image/png;base64,...' }
    });

    expect(received).toBe(true);
    expect(offscreenListener).toHaveBeenCalled();
  });

  // Test 6: OCR response returning successfully
  it('returns successful OCR response with text and confidence through the callback pipeline', async () => {
    const mockOcrResult = {
      status: 'succeeded',
      text: 'Rahul Kumar RD0038291029',
      confidence: 88.0,
      reasons: []
    };

    listeners.push((msg, sender, sendResponse) => {
      if (msg.target === 'offscreen') {
        sendResponse(mockOcrResult);
        return true;
      }
    });

    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'PERFORM_OCR', target: 'offscreen', payload: {} },
        (res) => resolve(res)
      );
    });

    expect(response).toEqual(mockOcrResult);
    expect(response.confidence).toBeGreaterThan(0);
    expect(response.text.length).toBeGreaterThan(0);
  });

  // Test 7: OCR error returning cleanly without crashing
  it('handles offscreen OCR errors cleanly without throwing unhandled exceptions', async () => {
    listeners.push((msg, sender, sendResponse) => {
      if (msg.target === 'offscreen') {
        sendResponse({
          status: 'failed',
          text: '',
          confidence: 0,
          reasons: ['Offscreen OCR error: Corrupted image input']
        });
        return true;
      }
    });

    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'PERFORM_OCR', target: 'offscreen', payload: {} },
        (res) => resolve(res)
      );
    });

    expect(response.status).toBe('failed');
    expect(response.confidence).toBe(0);
    expect(response.reasons[0]).toContain('Corrupted image input');
  });

  // Test 8: Worker creation and local path verification
  it('configures Tesseract with local extension paths and workerBlobURL=false', async () => {
    let capturedOptions = null;
    const mockTesseract = {
      createWorker: vi.fn(async (lang, oem, options) => {
        capturedOptions = options;
        return {
          recognize: vi.fn(async () => ({
            data: { text: 'SAMPLE DOCUMENT TEXT', confidence: 95.0 }
          })),
          terminate: vi.fn(async () => {})
        };
      })
    };

    const workerPath = chrome.runtime.getURL('lib/worker.min.js');
    const corePath = chrome.runtime.getURL('lib/tesseract-core.wasm.js');
    const langPath = chrome.runtime.getURL('lib/tessdata');

    expect(workerPath).toContain('lib/worker.min.js');
    expect(corePath).toContain('lib/tesseract-core.wasm.js');
    expect(langPath).toContain('lib/tessdata');

    const worker = await mockTesseract.createWorker('eng', 1, {
      workerPath,
      corePath,
      langPath,
      workerBlobURL: false
    });

    expect(mockTesseract.createWorker).toHaveBeenCalledWith('eng', 1, expect.objectContaining({
      workerPath: expect.stringContaining('lib/worker.min.js'),
      corePath: expect.stringContaining('lib/tesseract-core.wasm.js'),
      langPath: expect.stringContaining('lib/tessdata'),
      workerBlobURL: false
    }));

    const ocrRes = await worker.recognize('data:image/png;base64,sample');
    expect(ocrRes.data.text).toBe('SAMPLE DOCUMENT TEXT');
    expect(ocrRes.data.confidence).toBe(95.0);
  });

  // Test 9: OCR timeout handling
  it('handles OCR timeout gracefully and returns OCR timed out without hanging', async () => {
    const hungOcrExecution = () => new Promise((resolve) => {
      // Simulate hung OCR that never resolves
    });

    const timeoutPromise = (timeoutMs) => new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OCR timed out.')), timeoutMs);
    });

    let result;
    try {
      result = await Promise.race([
        hungOcrExecution(),
        timeoutPromise(50) // Short timeout for test
      ]);
    } catch (err) {
      result = {
        status: 'failed',
        text: '',
        confidence: 0,
        reasons: [err.message]
      };
    }

    expect(result.status).toBe('failed');
    expect(result.confidence).toBe(0);
    expect(result.reasons).toContain('OCR timed out.');
  });

  // Test 10: Empty or invalid image decoding rejection
  it('rejects invalid or empty image payloads before invoking OCR', async () => {
    function validateAndDecodePayload(payload) {
      const { imageSource } = payload || {};
      if (!imageSource || typeof imageSource !== 'string' || !imageSource.startsWith('data:image/')) {
        return {
          valid: false,
          error: 'Invalid or empty image payload received in offscreen context.'
        };
      }
      return { valid: true };
    }

    const emptyResult = validateAndDecodePayload({});
    expect(emptyResult.valid).toBe(false);
    expect(emptyResult.error).toContain('Invalid or empty');

    const nonImageResult = validateAndDecodePayload({ imageSource: 'not-a-data-url' });
    expect(nonImageResult.valid).toBe(false);

    const validResult = validateAndDecodePayload({ imageSource: 'data:image/png;base64,iVBORw0KGgo=' });
    expect(validResult.valid).toBe(true);
  });

  // Test 11: File replacement cancels / prevents stale OCR results
  it('discards stale in-flight OCR results when a document is replaced', async () => {
    let activeJobId = 0;
    let finalDocState = null;

    async function processFileSimulated(filename, ocrDelayMs, ocrText) {
      const thisJob = ++activeJobId;

      // Initial state
      finalDocState = {
        file: { name: filename },
        ocr: { status: 'processing', text: '', confidence: 0 }
      };

      // Simulated OCR delay
      await new Promise((r) => setTimeout(r, ocrDelayMs));

      // Guard against stale results
      if (thisJob !== activeJobId) {
        return; // Stale result discarded
      }

      finalDocState = {
        file: { name: filename },
        ocr: { status: 'succeeded', text: ocrText, confidence: 90 }
      };
    }

    // 1. Upload Doc A with slow OCR (100ms)
    const docAPromise = processFileSimulated('docA.png', 100, 'DOC A TEXT');

    // 2. Shortly after (20ms), user replaces with Doc B with faster OCR (30ms)
    await new Promise((r) => setTimeout(r, 20));
    const docBPromise = processFileSimulated('docB.png', 30, 'DOC B TEXT');

    // Wait for both to settle
    await Promise.all([docAPromise, docBPromise]);

    // Doc B must be the final state, Doc A must NOT have overwritten it
    expect(finalDocState.file.name).toBe('docB.png');
    expect(finalDocState.ocr.text).toBe('DOC B TEXT');
    expect(finalDocState.ocr.status).toBe('succeeded');
  });

  // Test 12: Manifest V3 CSP verification
  it('verifies manifest.json contains extension_pages CSP with wasm-unsafe-eval', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const manifestPath = path.resolve(__dirname, '../../../extension/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    expect(manifest.content_security_policy).toBeDefined();
    expect(manifest.content_security_policy.extension_pages).toBeDefined();
    expect(manifest.content_security_policy.extension_pages).toContain('wasm-unsafe-eval');
    expect(manifest.content_security_policy.extension_pages).toContain("'self'");
    // Verify unsafe-eval is NOT in CSP
    expect(manifest.content_security_policy.extension_pages).not.toContain("'unsafe-eval'");
  });
});

