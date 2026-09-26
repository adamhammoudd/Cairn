// Stand-in for src/lib/actions/settings.ts in the settings-currency browser
// test. Records every FormData the form POSTs and applies it to an in-memory
// row, then asks the harness to re-render with that row - the part
// revalidatePath plays in production.
export const store = {
  row: {} as Record<string, unknown>,
  posts: [] as Record<string, string>[],
  onSaved: () => {},
};

export async function updateSettings(_prev: string | null, formData: FormData) {
  const post = Object.fromEntries([...formData.entries()].map(([k, v]) => [k, String(v)]));
  store.posts.push(post);
  store.row = { ...store.row, currency: post.currency, metric_style: post.metric_style };
  await new Promise((r) => setTimeout(r, 30));
  store.onSaved();
  return "saved";
}
