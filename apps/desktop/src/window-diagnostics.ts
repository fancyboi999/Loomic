type DesktopLoadFailureOptions = Readonly<{
  attemptedEntrypoint: string;
  errorCode: number;
  errorDescription: string;
}>;

export function createDesktopLoadFailureUrl(
  options: DesktopLoadFailureOptions,
): string {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1"
    />
    <title>Loomic desktop failed to load</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top, rgba(255, 122, 69, 0.16), transparent 40%),
          #0f1115;
        color: #f5f7fb;
      }

      main {
        width: min(720px, calc(100vw - 48px));
        padding: 32px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 20px;
        background: rgba(20, 24, 31, 0.92);
        box-shadow: 0 28px 80px rgba(0, 0, 0, 0.32);
      }

      h1 {
        margin: 0 0 12px;
        font-size: 30px;
        line-height: 1.1;
      }

      p {
        margin: 0 0 18px;
        color: #c8d0db;
        line-height: 1.6;
      }

      dl {
        margin: 0;
        display: grid;
        gap: 14px;
      }

      dt {
        margin-bottom: 6px;
        color: #8fa3bf;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      dd {
        margin: 0;
        padding: 14px 16px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.04);
        color: #f5f7fb;
        overflow-wrap: anywhere;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Loomic desktop failed to load</h1>
      <p>
        The renderer entrypoint did not open successfully. Check the attempted
        location and the error details below.
      </p>
      <dl>
        <div>
          <dt>Attempted entrypoint</dt>
          <dd>${escapeHtml(options.attemptedEntrypoint)}</dd>
        </div>
        <div>
          <dt>Error code</dt>
          <dd>${options.errorCode}</dd>
        </div>
        <div>
          <dt>Error description</dt>
          <dd>${escapeHtml(options.errorDescription)}</dd>
        </div>
      </dl>
    </main>
  </body>
</html>`;

  return `data:text/html;charset=UTF-8,${encodeURIComponent(html)}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
