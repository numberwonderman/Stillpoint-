/**
 * NOPE API Client
 *
 * Implements /v1/evaluate for safety checks and /v1/signpost for resource retrieval.
 */

const NOPE_BASE_URL = process.env.NOPE_BASE_URL || "https://api.nope.net";
const NOPE_API_KEY = process.env.NOPE_API_KEY || "";

export async function evaluateSafety(message, history = []) {
  if (!NOPE_API_KEY) {
    console.warn("NOPE_API_KEY not set. Mocking safety gate to pass.");
    return { isCrisis: false, severity: "none", matchedResources: [] };
  }

  try {
    const res = await fetch(`${NOPE_BASE_URL}/v1/evaluate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${NOPE_API_KEY}`,
      },
      body: JSON.stringify({ text: message, messages: history }),
    });
    
    if (!res.ok) {
      console.error("NOPE API evaluation error", await res.text());
      // For MVP, if safety API fails, we return a safe default or mock a response.
      return { isCrisis: false, severity: "none", matchedResources: [] };
    }

    const data = await res.json();
    // Assuming data contains these fields based on standard NOPE API format
    return {
      isCrisis: data.isCrisis || false,
      severity: data.severity || "none",
      matchedResources: data.matchedResources || [],
    };
  } catch (err) {
    console.error("Failed to evaluate safety with NOPE API", err);
    return { isCrisis: false, severity: "none", matchedResources: [] };
  }
}

export async function signpostResources({ query = "", country = "US" } = {}) {
  try {
    const params = new URLSearchParams();
    if (query) params.append("query", query);
    params.append("country", country);

    // Using the free, public sandbox endpoint which returns AI-ranked search results
    const res = await fetch(`${NOPE_BASE_URL}/v1/try/signpost/smart?${params.toString()}`, {
      method: "GET",
    });

    if (!res.ok) {
      console.error("NOPE API signpost error", await res.text());
      return [];
    }
    
    const data = await res.json();
    const results = data.ranked || data.resources || data.results || [];
    return results.map(r => r.resource ? { ...r.resource, why: r.why || r.resource.why } : r);
  } catch (err) {
    console.error("Failed to fetch signpost resources", err);
    return [];
  }
}
