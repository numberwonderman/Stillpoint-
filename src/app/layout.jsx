import "./globals.css";
import NavBar from "./components/NavBar";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata = {
  title: "Stillpoint — a quiet place to name what you're feeling",
  description:
    "Stillpoint is a private, on-device tool for naming difficult emotions. Your words stay on your device.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <head>
        {/* Atkinson Hyperlegible Next: designed by the Braille Institute
            specifically for readers with low vision. Used everywhere, not
            just as an accent — legibility is the point, not a decoration. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
