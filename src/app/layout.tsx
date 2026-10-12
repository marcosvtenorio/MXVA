import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";
import { AnalyticsProvider } from "@/components/common/AnalyticsProvider";
import { ClientBootstrap } from "@/components/common/ClientBootstrap";
import { publicConfig } from "@/lib/config";
import "./globals.css";

const instrument = localFont({
  src: "./fonts/InstrumentSans-latin-wght.woff2",
  weight: "400 700",
  variable: "--font-instrument",
  display: "swap",
});

const fragment = localFont({
  src: "./fonts/FragmentMono-latin-400.woff2",
  weight: "400",
  variable: "--font-fragment",
  display: "swap",
});

const title = `${publicConfig.brandName} · Your face. Your full glow-up.`;
const description =
  "Explore a personalized looksmaxxing roadmap and an AI concept portrait based on your own photos. One-time $29, PDF by email, photos not kept.";

export const metadata: Metadata = {
  metadataBase: new URL(publicConfig.appUrl),
  title: { default: title, template: `%s · ${publicConfig.brandName}` },
  description,
  applicationName: publicConfig.brandName,
  openGraph: { title, description, type: "website", siteName: publicConfig.brandName },
  twitter: { card: "summary_large_image", title, description },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F5F3" },
    { media: "(prefers-color-scheme: dark)", color: "#0D1012" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${instrument.variable} ${fragment.variable}`}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 pill-link">
          Skip to content
        </a>
        {children}
        <ClientBootstrap />
        <Suspense fallback={null}>
          <AnalyticsProvider />
        </Suspense>
      </body>
    </html>
  );
}
