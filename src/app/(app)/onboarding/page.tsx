import { OnboardingSteps } from "@/components/onboarding/onboarding-steps";

export const metadata = { title: "Getting started · Cairn" };

export default function OnboardingPage() {
  return (
    <div className="animate-page-in mx-auto max-w-[820px]">
      <div className="mb-5.5">
        <div className="mb-2 font-mono text-[10.5px] tracking-[0.16em] text-muted uppercase">First run</div>
        <h1 className="font-serif text-[32px] leading-tight font-normal text-primary">Stack the first stones</h1>
        <p className="mt-1.5 max-w-[560px] text-[13.5px] text-muted text-pretty">
          Three steps to make Base Camp useful. You can skip any of them and come back from the account menu.
        </p>
      </div>

      <OnboardingSteps />
    </div>
  );
}
