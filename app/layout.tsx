import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/toast";
import { ConfirmProvider } from "@/components/confirm";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Yubi Demolition — Timesheets & Clock-in",
  description:
    "Geofenced clock-in, live workforce tracking and timesheet approvals.",
  applicationName: "Yubi Demolition",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Yubi Demolition" },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#3d1a1a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full">
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
