// What the 404 page says, by who is looking (audit 2026-10-02, item 5.11).
//
// It used to say "once you're signed in" to people who were signed in, and offer
// "Back to dashboard" to logged-out visitors (where "/" sends them to the
// waitlist). One copy for both was wrong for one of them either way.

export interface NotFoundCopy {
  heading: string;
  body: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
}

export function notFoundCopy(signedIn: boolean): NotFoundCopy {
  if (signedIn) {
    return {
      heading: "Nothing at this address",
      body: "That page doesn't exist. If you were looking for a ticker, use the search in the header - Cairn fetches any ticker its data provider carries the first time it's asked for.",
      primary: { label: "Back to Base Camp", href: "/" },
      secondary: { label: "Browse markets", href: "/markets" },
    };
  }
  return {
    heading: "Nothing at this address",
    body: "That page doesn't exist. Cairn is invite-only for now - you can join the waitlist, or read what it is.",
    primary: { label: "Join the waitlist", href: "/waitlist" },
    secondary: { label: "About Cairn", href: "/welcome" },
  };
}
