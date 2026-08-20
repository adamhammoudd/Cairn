import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";

// The mock has no auth screen of its own, so these borrow its vocabulary:
// canvas ground, a panel card with the onboarding hero gradient and accent
// glow, serif heading, mono eyebrow, and the same field and button treatment
// used everywhere inside the app.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-5 py-12">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex justify-center">
          <Link href="/login" aria-label="Cairn">
            <Logo size={30} />
          </Link>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-line bg-[linear-gradient(180deg,#131313,#0F0F0F)] px-7 py-8">
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(420px 160px at 50% 0%, rgba(47,198,133,0.12), transparent 70%)" }}
          />
          <div className="relative">{children}</div>
        </div>
      </div>
    </div>
  );
}
