/**
 * Country detection for signpost resources.
 *
 * Vercel sets `x-vercel-ip-country` on every request to deployments
 * that opt in. In local dev we fall back to `DEFAULT_COUNTRY`,
 * and as a last resort default to `"US"` so signpost always
 * receives a valid ISO-3166 alpha-2 code.
 */

const COUNTRY_CODE_RE = /^[A-Z]{2}$/;

export function getRequestCountry(request) {
  const vercelCountry = request.headers
    .get("x-vercel-ip-country")
    ?.trim()
    .toUpperCase();

  if (vercelCountry && COUNTRY_CODE_RE.test(vercelCountry)) {
    return vercelCountry;
  }

  const envCountry = process.env.DEFAULT_COUNTRY
    ?.trim()
    .toUpperCase();

  if (envCountry && COUNTRY_CODE_RE.test(envCountry)) {
    return envCountry;
  }

  return "US";
}
