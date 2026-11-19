const BRIDGE_MARKER = 'data-physica-preview-bridge';

const BRIDGE_SCRIPT = `<script ${BRIDGE_MARKER}>
(function () {
  if (window.__physicaBridgeInstalled) return;
  window.__physicaBridgeInstalled = true;

  function post(type, payload) {
    try {
      window.parent.postMessage(
        {
          source: 'physica-preview',
          type: type,
          payload: payload,
          timestamp: Date.now(),
        },
        '*'
      );
    } catch (e) {}
  }

  function formatArg(arg) {
    if (arg instanceof Error) return arg.stack || arg.message;
    if (typeof arg === 'object' && arg !== null) {
      try {
        return JSON.stringify(arg);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }

  window.addEventListener('error', function (event) {
    post('runtime_error', {
      message: event.message || 'Uncaught script error',
      source: event.filename || 'inline',
      line: event.lineno || 0,
      column: event.colno || 0,
    });
  });

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    post('runtime_error', {
      message: reason && reason.message ? reason.message : String(reason || 'Unhandled Promise rejection'),
      source: 'promise',
      line: 0,
      column: 0,
    });
  });

  var origError = console.error;
  console.error = function () {
    var args = Array.prototype.slice.call(arguments);
    post('console_error', {
      message: args.map(formatArg).join(' '),
    });
    if (origError) origError.apply(console, arguments);
  };

  var origWarn = console.warn;
  console.warn = function () {
    var args = Array.prototype.slice.call(arguments);
    post('console_warn', {
      message: args.map(formatArg).join(' '),
    });
    if (origWarn) origWarn.apply(console, arguments);
  };

  function notifyReady() {
    var canvasCount = document.querySelectorAll('canvas').length;
    post('sim_ready', {
      title: document.title || 'Simulation',
      canvasCount: canvasCount,
    });
  }

  if (document.readyState === 'complete') {
    setTimeout(notifyReady, 150);
  } else {
    window.addEventListener('load', function () {
      setTimeout(notifyReady, 250);
    });
  }
})();
</script>`;

export function injectPreviewBridge(html: string): string {
  const cleanHtml = stripPreviewBridge(html);
  if (/<head[\s>]/i.test(cleanHtml)) {
    return cleanHtml.replace(/<head([^>]*)>/i, (_match, attrs) => `<head${attrs}>\n${BRIDGE_SCRIPT}`);
  }
  if (/<html[\s>]/i.test(cleanHtml)) {
    return cleanHtml.replace(
      /<html([^>]*)>/i,
      (_match, attrs) => `<html${attrs}>\n<head>${BRIDGE_SCRIPT}</head>`
    );
  }
  return `${BRIDGE_SCRIPT}\n${cleanHtml}`;
}

export function stripPreviewBridge(html: string): string {
  return html.replace(
    new RegExp(`<script\\s+${BRIDGE_MARKER}[^>]*>[\\s\\S]*?<\\/script>\\s*`, 'gi'),
    ''
  );
}
