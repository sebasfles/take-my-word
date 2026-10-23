import { Landing, landingPageMetadata } from "@/components/landing/landing.tsx";

export const generateMetadata = () => landingPageMetadata("es");

export default function Page() {
  return <Landing locale="es" />;
}
