import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "@/components/LanguageProvider";

export const metadata: Metadata = {
  title: "Panther Legacy Garage | Motorcycle Parts & Service",
  description: "Motorcycle spare parts, accessories and expert repairs.",
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
