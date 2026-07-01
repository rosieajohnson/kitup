import type { Metadata } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CartProvider } from "@/components/cart/cart-context";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isStripeConfigured } from "@/lib/stripe";
import { getViewer } from "@/lib/auth";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Kit Up — fund the sports gear local schools need",
    template: "%s · Kit Up",
  },
  description:
    "Kit Up is a crowdfunding platform where Australian schools list the sports equipment they need and donors fund it, item by item.",
  metadataBase: new URL("https://kitup.example"),
  openGraph: {
    title: "Kit Up — fund the sports gear local schools need",
    description:
      "Back your local school's next season. Browse real equipment needs and fund them item by item.",
    type: "website",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await getViewer();

  return (
    <html lang="en-AU" className={`${bricolage.variable} ${jakarta.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <CartProvider
          checkoutEnabled={isSupabaseConfigured() && isStripeConfigured()}
          signedInDonor={viewer.role === "donor"}
        >
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
          <CartDrawer />
        </CartProvider>
      </body>
    </html>
  );
}
