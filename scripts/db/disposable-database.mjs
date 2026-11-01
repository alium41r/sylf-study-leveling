/** Legacy destructive QA must never inherit a hosted application URL. */
export function focusPartyTestUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "Set FOCUS_PARTY_TEST_DATABASE_URL to a disposable loopback database."
    );
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !/^\/sylf_focus_party_test(?:_[a-z0-9]+)?$/.test(url.pathname) ||
    url.searchParams.has("host")
  )
    throw new Error(
      "Focus Party QA requires a disposable loopback sylf_focus_party_test database; hosted application URLs are forbidden."
    );
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  return url.toString();
}
