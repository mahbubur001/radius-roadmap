/** Public site path: /<account>[/<workspace>][/<rest>] (doc 19, D1 revised). */
export function publicPath(account: string, workspace?: string, rest = "") {
  return [`/${account}`, workspace, rest].filter(Boolean).join("/");
}
