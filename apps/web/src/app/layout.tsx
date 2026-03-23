import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Loomic",
  description: "Minimal Loomic web workbench",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="page-shell">{children}</div>
        <style>{`
          :root {
            color-scheme: light;
            background:
              radial-gradient(circle at top left, rgba(95, 152, 255, 0.16), transparent 40%),
              radial-gradient(circle at bottom right, rgba(32, 165, 140, 0.18), transparent 35%),
              #f4f8fc;
            font-family:
              "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino,
              serif;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            min-height: 100vh;
          }

          .page-shell {
            min-height: 100vh;
          }
        `}</style>
      </body>
    </html>
  );
}
