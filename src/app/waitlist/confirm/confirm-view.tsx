import Link from "next/link";
import { BUTTON_SECONDARY, EYEBROW } from "@/components/front-door/styles";

export type Outcome =
  | { kind: "confirmed" | "already"; position: number | null; founding: boolean; limit: number }
  | { kind: "invalid" };

const BODY = "mt-3 text-lead leading-relaxed text-muted text-pretty";

export function ConfirmView({ outcome }: { outcome: Outcome }) {
  if (outcome.kind === "invalid") {
    return (
      <>
        <div className={EYEBROW}>Waitlist</div>
        <h1 className="mt-2 font-serif text-h1 font-normal text-primary">This link isn&apos;t valid</h1>
        <p className={BODY}>
          The confirmation link is incomplete or no longer valid. Join again from the waitlist - if your
          address is already on the list, we&apos;ll just re-send the link.
        </p>
        <Link href="/waitlist" className={`${BUTTON_SECONDARY} mt-6 w-full`}>
          Back to the waitlist
        </Link>
      </>
    );
  }

  return (
    <>
      <div className={EYEBROW}>{outcome.kind === "already" ? "Already confirmed" : "You're confirmed"}</div>
      <h1 className="mt-2 font-serif text-h1 font-normal text-primary">
        {outcome.position !== null ? <>You&apos;re #{outcome.position} on the waitlist</> : "You're on the waitlist"}
      </h1>

      {outcome.founding ? (
        <p className={BODY}>
          You made the first <span className="text-primary">{outcome.limit}</span> - you&apos;re a{" "}
          <span className="text-primary">founding member</span>. Two months of Premium are reserved for
          this email address. They begin the day your access starts at launch, not today.
        </p>
      ) : (
        <p className={BODY}>
          The {outcome.limit} founding-member places are filled, so this isn&apos;t a founding spot - but
          you&apos;re on the list and you&apos;ll get standard access when Cairn launches.
        </p>
      )}

      <p className="mt-4 border-t border-line-soft pt-4 text-body leading-relaxed text-primary text-pretty">
        Nothing else to do now. We invite people in batches, in the order they joined. You&apos;ll get an
        email with your personal link.
      </p>
    </>
  );
}
