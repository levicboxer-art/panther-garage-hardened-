import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "@/components/LanguageProvider";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://panther-legacy-garage.vercel.app"),
  title: "Panther Legacy Garage | Motorcycle Parts & Service",
  description: "Motorcycle spare parts, accessories and expert repairs.",
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png", sizes: "1254x1254" }],
    shortcut: ["/favicon.png"],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "1254x1254" }],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "Panther Legacy Garage | Motorcycle Parts & Service",
    description: "Motorcycle spare parts, accessories and expert repairs.",
    type: "website",
    images: [{ url: "/favicon.png", width: 1254, height: 1254, alt: "Panther Legacy Garage emblem" }],
  },
};

// Restore the language attribute before paint so assistive technology and CSS
// never see a stale language while the provider hydrates.
const localeBootstrap = `(function(){try{var l=window.localStorage.getItem("pgms-locale");if(l==="en"||l==="rw"||l==="fr"){document.documentElement.lang=l;}}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: localeBootstrap }} />
      </head>
      <body className="antialiased">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
