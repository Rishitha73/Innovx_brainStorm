// Pre-Submission Error Guard - Offscreen OCR Execution Context (Phase 6)
// Executes local Tesseract.js in an extension-owned origin context to satisfy Chrome MV3 Worker origin security
window.isOffscreenContext = true;

console.log('[OCR TRACE] offscreen: document loaded');

const OCR_TIMEOUT_MS = 30000; // 30 second defensive timeout
let currentWorker = null;
let currentWorkerLang = null;
let currentJobId = 0;

console.log('[OCR TRACE] offscreen: listener registered');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'PERFORM_OCR' && message.target === 'offscreen') {
    console.log('[OCR TRACE] offscreen: PERFORM_OCR received');

    const thisJobId = ++currentJobId;
    const { imageSource, options = {} } = message.payload || {};
    const lang = options.lang || 'eng';
    const minConfidenceThreshold = options.minConfidenceThreshold || 60.0;

    (async () => {
      // 1. Check & decode image payload before OCR (Section 7, 8)
      if (!imageSource || typeof imageSource !== 'string') {
        const errReason = 'Invalid or empty image payload received in offscreen context.';
        console.error('[OCR TRACE] offscreen: OCR ERROR', errReason);
        console.log('[OCR TRACE] offscreen: sending OCR response');
        sendResponse({
          status: 'failed',
          text: '',
          confidence: 0,
          reasons: [errReason]
        });
        return;
      }

      let decodedImg = null;
      try {
        decodedImg = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = (e) => reject(new Error('Image decoding failed in offscreen context'));
          img.src = imageSource;
        });
      } catch (decodeErr) {
        console.error('[OCR TRACE] offscreen: OCR ERROR', decodeErr.message);
        console.log('[OCR TRACE] offscreen: sending OCR response');
        sendResponse({
          status: 'failed',
          text: '',
          confidence: 0,
          reasons: [`Image decoding failed in offscreen context: ${decodeErr.message}`]
        });
        return;
      }

      const imgWidth = decodedImg.naturalWidth || decodedImg.width || 0;
      const imgHeight = decodedImg.naturalHeight || decodedImg.height || 0;
      const payloadLength = imageSource.length;
      console.log(`[OCR TRACE] image payload received width=${imgWidth} height=${imgHeight} payloadLength=${payloadLength}`);

      // Setup defensive timeout
      let timeoutHandle = null;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error('OCR timed out.'));
        }, OCR_TIMEOUT_MS);
      });

      try {
        const tesseractLib = (typeof window !== 'undefined' && window.Tesseract)
          ? window.Tesseract
          : (typeof globalThis !== 'undefined' ? globalThis.Tesseract : null);

        if (!tesseractLib || typeof tesseractLib.createWorker !== 'function') {
          throw new Error('Tesseract.js library is not available in offscreen context.');
        }

        // 2. Worker Lifecycle: Create or reuse Tesseract worker (Section 13)
        let worker = currentWorker;

        if (!worker || currentWorkerLang !== lang) {
          if (worker) {
            try { await worker.terminate(); } catch (e) {}
            currentWorker = null;
          }

          console.log('[OCR TRACE] offscreen: creating Tesseract worker');

          const tesseractOptions = {
            workerPath: chrome.runtime.getURL('lib/worker.min.js'),
            corePath: chrome.runtime.getURL('lib/tesseract-core.wasm.js'),
            langPath: chrome.runtime.getURL('lib/tessdata'),
            workerBlobURL: false,
            logger: (m) => {
              if (thisJobId !== currentJobId) return; // Ignore stale job logs
              if (m.status === 'initializing tesseract') {
                if (m.progress === 0) console.log('[OCR TRACE] offscreen: worker.load()');
                if (m.progress === 1) console.log('[OCR TRACE] offscreen: worker loaded');
              } else if (m.status === 'loading language traineddata') {
                if (m.progress === 0) console.log('[OCR TRACE] offscreen: worker.loadLanguage()');
                if (m.progress === 1) console.log('[OCR TRACE] offscreen: language loaded');
              } else if (m.status === 'initializing api') {
                if (m.progress === 0) console.log('[OCR TRACE] offscreen: worker.initialize()');
                if (m.progress === 1) console.log('[OCR TRACE] offscreen: worker initialized');
              } else if (m.status === 'recognizing text') {
                const pct = typeof m.progress === 'number' ? Math.round(m.progress * 100) : 0;
                console.log(`[OCR TRACE] offscreen: recognize progress ${pct}%`);
              }
            }
          };

          worker = await Promise.race([
            tesseractLib.createWorker(lang, 1, tesseractOptions),
            timeoutPromise
          ]);

          console.log('[OCR TRACE] offscreen: worker created');
          currentWorker = worker;
          currentWorkerLang = lang;
        } else {
          // Reused worker already loaded and initialized
          console.log('[OCR TRACE] offscreen: reusing active Tesseract worker');
          console.log('[OCR TRACE] offscreen: worker loaded');
          console.log('[OCR TRACE] offscreen: language loaded');
          console.log('[OCR TRACE] offscreen: worker initialized');
        }

        // 3. Execute Recognition
        console.log('[OCR TRACE] offscreen: worker.recognize() starting');
        const ocrResult = await Promise.race([
          worker.recognize(imageSource),
          timeoutPromise
        ]);
        console.log('[OCR TRACE] offscreen: recognize completed');

        clearTimeout(timeoutHandle);

        // Check if another job superseded this one
        if (thisJobId !== currentJobId) {
          console.warn(`[OCR TRACE] offscreen: Job ${thisJobId} superseded by job ${currentJobId}. Discarding response.`);
          return;
        }

        const rawText = ocrResult?.data?.text ? ocrResult.data.text.trim() : '';
        const rawConfidence = (ocrResult?.data?.confidence !== undefined)
          ? ocrResult.data.confidence
          : 0;
        const confidence = Math.round(rawConfidence * 100) / 100;
        const reasons = [];

        if (!rawText) {
          reasons.push('No readable text could be recognized from the document.');
        } else if (confidence < minConfidenceThreshold) {
          reasons.push(`Low OCR confidence (${confidence}%). Some characters may require manual review.`);
        }

        console.log('[OCR TRACE] offscreen: sending OCR response');
        sendResponse({
          status: 'succeeded',
          text: rawText,
          confidence,
          reasons
        });
      } catch (err) {
        clearTimeout(timeoutHandle);

        console.error('[OCR TRACE] offscreen: OCR ERROR', err.message || err);

        // Terminate worker if it hung or crashed
        if (currentWorker) {
          try { await currentWorker.terminate(); } catch (e) {}
          currentWorker = null;
          currentWorkerLang = null;
        }

        if (thisJobId !== currentJobId) return;

        const isTimeout = (err.message && err.message.includes('timed out'));
        const failureReason = isTimeout ? 'OCR timed out.' : `Offscreen OCR error: ${err.message || 'Unknown recognition error'}`;

        console.log('[OCR TRACE] offscreen: sending OCR response');
        sendResponse({
          status: 'failed',
          text: '',
          confidence: 0,
          reasons: [failureReason]
        });
      }
    })();

    return true; // Keep message channel open for async sendResponse
  }
});
