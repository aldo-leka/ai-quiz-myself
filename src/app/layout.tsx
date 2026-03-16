import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { getSiteUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "QuizPlus",
    "custom trivia game",
    "quiz from pdf",
    "birthday trivia game",
    "movie trivia night",
    "millionaire game online",
    "couch co-op quiz",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} social preview`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: ["/twitter-image"],
  },
  icons: {
    icon: [{ url: "/icon", type: "image/png", sizes: "256x256" }],
    apple: [{ url: "/apple-icon", type: "image/png", sizes: "180x180" }],
    shortcut: ["/icon"],
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "black-translucent",
  },
  category: "games",
};

export const viewport: Viewport = {
  themeColor: "#0f1117",
  colorScheme: "dark",
};

const browserSupportBootstrap = `(function () {
  var doc = document;
  var root = doc.documentElement;

  function setState(state) {
    root.setAttribute("data-browser-support", state);
  }

  function hasFeature(name) {
    try {
      switch (name) {
        case "Promise":
          return typeof window.Promise === "function";
        case "fetch":
          return typeof window.fetch === "function";
        case "WebSocket":
          return typeof window.WebSocket === "function";
        case "URLSearchParams":
          return typeof window.URLSearchParams === "function";
        case "AbortController":
          return typeof window.AbortController === "function";
        case "requestAnimationFrame":
          return typeof window.requestAnimationFrame === "function";
        case "localStorage":
          var key = "__quizplus_support_check__";
          window.localStorage.setItem(key, "1");
          window.localStorage.removeItem(key);
          return true;
        case "cssGrid":
          return !!(window.CSS && window.CSS.supports && window.CSS.supports("display", "grid"));
        default:
          return false;
      }
    } catch (error) {
      return false;
    }
  }

  function isForcedUnsupported() {
    try {
      if (window.location.search.indexOf("unsupported-browser=1") !== -1) {
        return true;
      }

      return window.localStorage.getItem("quizplus.forceUnsupportedBrowser") === "1";
    } catch (error) {
      return false;
    }
  }

  var required = [
    "Promise",
    "fetch",
    "WebSocket",
    "URLSearchParams",
    "AbortController",
    "requestAnimationFrame",
    "localStorage",
    "cssGrid",
  ];

  if (isForcedUnsupported()) {
    setState("unsupported");
    return;
  }

  for (var index = 0; index < required.length; index += 1) {
    if (!hasFeature(required[index])) {
      setState("unsupported");
      return;
    }
  }

  setState("supported");
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-browser-support="checking" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Script
          id="quizplus-browser-support-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: browserSupportBootstrap }}
        />
        <div id="unsupported-browser-screen" aria-live="polite">
          <main className="quizplus-browser-fallback">
            <div className="quizplus-browser-fallback__card">
              <p className="quizplus-browser-fallback__eyebrow">Browser not supported</p>
              <h1 className="quizplus-browser-fallback__title">Try another browser to play QuizPlus.</h1>
              <p className="quizplus-browser-fallback__note">
                Some TV browsers and older in-app browsers do not support the game yet. If possible, install a newer
                browser app on this device and try again.
              </p>
            </div>
          </main>
        </div>
        <div id="app-shell">
          <TooltipProvider>{children}</TooltipProvider>
        </div>
        <SpeedInsights />
      </body>
    </html>
  );
}
