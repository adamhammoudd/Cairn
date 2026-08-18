import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <div>
        <Logo size={34} />
      </div>
      {children}
    </div>
  );
}
