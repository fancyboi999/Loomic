/**
 * Lemon Squeezy overlay checkout JS SDK type declarations.
 * Loaded via <Script src="https://app.lemonsqueezy.com/js/lemon.js" />.
 */
interface LemonSqueezyInstance {
  Url: {
    Open: (url: string) => void;
    Close: () => void;
  };
  Setup: (options?: { eventHandler?: (event: { event: string }) => void }) => void;
  Refresh: () => void;
}

interface Window {
  LemonSqueezy?: LemonSqueezyInstance;
}
