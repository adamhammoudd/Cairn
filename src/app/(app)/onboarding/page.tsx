import { OnboardingSteps } from "@/components/onboarding/onboarding-steps";

export const metadata = { title: "Getting started · Cairn" };

export default function OnboardingPage() {
  return (
    <div className="animate-page-in mx-auto max-w-[820px]">
      <OnboardingSteps />
    </div>
  );
}
