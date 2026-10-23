"use client";

import { ErrorState } from "@/components/error-state.tsx";
import { useStateStrings } from "@/components/state-strings.tsx";

export default function AccountError({ retry }: { retry: () => void }) {
  return <ErrorState t={useStateStrings()} retry={retry} />;
}
