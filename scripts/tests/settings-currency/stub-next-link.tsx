import type { ReactNode } from "react";
export default function Link({ href, children, ...rest }: { href: string; children: ReactNode }) {
  return <a href={href} {...rest}>{children}</a>;
}
