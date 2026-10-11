import type { Metadata, Viewport } from "next";
import { AnalyticsProvider } from "@/components/common/AnalyticsProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "MXVA",
  description: "A realistic next-step plan for your face.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        {children}
        <AnalyticsProvider />
      </body>
    </html>
  );
}
