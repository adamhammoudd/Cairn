// Browser test: does choosing a display currency in Settings actually persist,
// and does it survive the NEXT save?
//
// 2026-09-26: the founder had EUR showing in Settings while both user_settings
// rows held USD, and the API logs showed two successful (204) settings saves
// in the previous day - so the saves ran and wrote USD. This renders the REAL
// SettingsForm in Chromium with a stub action that records every POST and
// re-renders the form with the saved row (what revalidatePath does).
//
// Run: npx tsx scripts/tests/settings-currency-save.ts
import path from "node:path";
import { build } from "esbuild";
import { chromium, type Page } from "playwright";

const ROOT = path.resolve(__dirname, "../..");
const HERE = path.join(__dirname, "settings-currency");

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (ok) pass++;
  else fail++;
}

const STUBS: Record<string, string> = {
  "@/lib/actions/settings": path.join(HERE, "stub-actions-settings.ts"),
  "next/link": path.join(HERE, "stub-next-link.tsx"),
};

async function bundle(): Promise<string> {
  const out = await build({
    entryPoints: [path.join(HERE, "harness.tsx")],
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
    logLevel: "silent",
    plugins: [
      {
        name: "cairn-resolve",
        setup(b) {
          b.onResolve({ filter: /^(@\/|next\/link$)/ }, async (args) => {
            if (STUBS[args.path]) return { path: STUBS[args.path] };
            const r = await b.resolve(`./${args.path.slice(2)}`, { resolveDir: path.join(ROOT, "src"), kind: args.kind });
            return { path: r.path };
          });
        },
      },
    ],
  });
  return out.outputFiles[0].text;
}

const posts = (p: Page) => p.evaluate(() => (window as unknown as { __store: { posts: Record<string, string>[] } }).__store.posts.slice());
const currency = (p: Page) => p.locator('select[name="currency"]');

async function save(p: Page, expectPosts: number) {
  await p.getByRole("button", { name: "Save changes" }).click();
  await p.waitForFunction(
    (n) => (window as unknown as { __store: { posts: unknown[] } }).__store.posts.length >= n,
    expectPosts,
    { timeout: 3000 },
  );
  await p.waitForTimeout(150); // let the post-save reset + re-render settle
}

async function main() {
  const js = await bundle();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setContent(`<!doctype html><html><body><div id="root"></div><script>${js.replace(/<\/script/g, "<\/script")}</script></body></html>`);
  try {
    await currency(page).waitFor({ timeout: 10_000 });
  } catch {
    check("the form renders", false, errors.join(" | ") || "no select[name=currency]");
    await browser.close();
    process.exitCode = 1;
    return;
  }

  // 1. Pick EUR and save.
  await currency(page).selectOption("EUR");
  await save(page, 1);
  let sent = await posts(page);
  check("save 1 POSTs currency=EUR", sent[0]?.currency === "EUR", `posted ${sent[0]?.currency}`);
  check(
    "after save 1 the unsaved-changes bar is gone",
    !(await page.getByRole("button", { name: "Save changes" }).isVisible().catch(() => false)),
  );
  check("after save 1 the control still shows EUR", (await currency(page).inputValue()) === "EUR", `shows ${await currency(page).inputValue()}`);

  // 2. Change something unrelated and save again. The currency must not revert.
  await page.locator('select[name="refresh_rate_seconds"]').selectOption("300");
  const barVisible = await page.getByRole("button", { name: "Save changes" }).isVisible().catch(() => false);
  check("an unrelated change shows the save bar", barVisible);
  if (barVisible) {
    await save(page, 2);
    sent = await posts(page);
    check("save 2 (refresh rate only) still POSTs currency=EUR", sent[1]?.currency === "EUR", `posted ${sent[1]?.currency}`);
  }
  check("after save 2 the control shows EUR", (await currency(page).inputValue()) === "EUR", `shows ${await currency(page).inputValue()}`);
  check("no page errors", errors.length === 0, errors.join(" | "));

  await browser.close();
  console.log(`\n${pass}/${pass + fail} settings-currency-save cases passed`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
