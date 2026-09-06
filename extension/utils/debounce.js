// Pre-Submission Error Guard - Debounce Utility (Phase 10)
// Provides debounce functionality with cancel and flush support

function debounce(func, wait = 300) {
  let timeout = null;
  let lastArgs = null;
  let lastThis = null;

  function debounced(...args) {
    lastArgs = args;
    lastThis = this;
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      timeout = null;
      func.apply(lastThis, lastArgs);
      lastArgs = null;
      lastThis = null;
    }, wait);
  }

  debounced.cancel = function () {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    lastArgs = null;
    lastThis = null;
  };

  debounced.flush = function () {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
      const result = func.apply(lastThis, lastArgs);
      lastArgs = null;
      lastThis = null;
      return result;
    }
  };

  debounced.isPending = function () {
    return Boolean(timeout);
  };

  return debounced;
}

// Support Node.js / Vitest environment and Browser environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { debounce };
} else if (typeof globalThis !== 'undefined') {
  globalThis.debounce = debounce;
}
