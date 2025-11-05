import { DM_Sans, Fira_Code } from "next/font/google";
import "./globals.scss";
import { ThemeProvider } from "../../components/ThemeProvider";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-fira-code",
  display: "swap",
});

export const metadata = {
  title: "nixbuilder.dev - Build Full-Stack Next.js Apps with AI",
  description:
    "Describe your app. Get a live Next.js build in minutes. Plan → Code → Preview on Fly.io. Auth, DB, APIs included.",
};

export default function RootLayout({ children }) {
  return (
    <html
      className={`${dmSans.variable} ${firaCode.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('theme') || 'dark';
                document.documentElement.setAttribute('data-theme', theme);
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
