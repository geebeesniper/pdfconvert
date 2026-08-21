import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata={title:"COA Converter",description:"Project-based PDF to Excel COA conversion"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
