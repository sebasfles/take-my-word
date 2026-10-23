import { Landing, landingPageMetadata } from "@/components/landing/landing.tsx";

export const generateMetadata = () => landingPageMetadata("en");

export default function Page() {
  return <Landing locale="en" />;
}
