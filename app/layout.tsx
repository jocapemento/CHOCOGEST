import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "ChocoGest • Fábrica Bean-to-Bar",
  description: "Sistema de gestão para fábrica de chocolate artesanal - Bahia",
  metadataBase: new URL(
    basePath ? "https://jocapemento.github.io/CHOCOGEST" : "http://localhost:3000"
  ),
  icons: {
    icon: `${basePath}/favicon.ico`,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ChocoGest",
  },
  formatDetection: {
    telephone: false,
  },
};

/** Critérios de viewport para smartphone, tablet e desktop. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#2c2118" },
    { media: "(prefers-color-scheme: light)", color: "#2c2118" },
  ],
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
