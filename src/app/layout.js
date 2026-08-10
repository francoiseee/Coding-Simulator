import { Inter, Outfit } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  title: "Codely - Sign Up",
  description: "Join the next generation of academic simulation.",
};

// Runs before first paint so the correct palette (per src/lib/theme.js) is
// already applied when React hydrates — no flash of the wrong theme, and it
// works on routes that never render the Navbar toggle. Storage key must
// match THEME_STORAGE_KEY in src/lib/theme.js.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var theme = localStorage.getItem("codely-theme") || "dark";
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
`;

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${outfit.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        {children}
      </body>
    </html>
  );
}
