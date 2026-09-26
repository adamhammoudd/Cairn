// The User-Agent every request to sec.gov / data.sec.gov sends. SEC's
// fair-access policy requires a real, monitored contact and blocks clients
// without one; "contact@example.com" was a placeholder that could get Cairn
// rate-limited or refused outright.
export const SEC_USER_AGENT = "Cairn cairnai.business@gmail.com";
