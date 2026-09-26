// next/link outside a Next app: a plain anchor is all the test needs.
import type { AnchorHTMLAttributes } from "react";

export default function Link({ href, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a href={href} {...rest} />;
}
