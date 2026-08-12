import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Sidebar } from "@/components/Sidebar";
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
  title: "Parcel Acquisition CRM — Rock Island County, IL",
  description:
    "Map-based parcel acquisition CRM for data-center land assembly in Rock Island County, Illinois.",
};

const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
const branch = process.env.VERCEL_GIT_COMMIT_REF;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <div className="flex min-h-screen flex-col sm:flex-row">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <main className="flex-1 p-6 sm:p-10">{children}</main>
            <footer className="border-t border-black/10 px-6 py-3 font-mono text-[11px] text-black/45 sm:px-10 dark:border-white/15 dark:text-white/45">
              parcel-crm
              {branch ? ` · ${branch}` : ""}
              {commit ? ` · ${commit}` : " · local"}
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
