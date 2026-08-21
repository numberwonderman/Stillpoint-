import { z } from "zod";

const NOPE_BASE_URL =
  process.env.NOPE_BASE_URL || "https://api.nope.net";

const NOPE_API_KEY = process.env.NOPE_API_KEY;


const SeveritySchema = z.enum([
  "none",
  "mild",
  "moderate",
  "high",
  "critical",
]);


const ImminenceSchema = z.enum([
  "not_applicable",
  "chronic",
  "subacute",
  "urgent",
  "emergency",
]);

const NopeRiskSchema = z.object({
  type: z.string(),
  subject: z.enum(["self", "other"]),
  severity: SeveritySchema,
  imminence: ImminenceSchema,
  features: z.array(z.string()).optional(),
});

const NopeResourceSchema = z
  .object({
    type: z.string().optional(),
    name: z.string(),
    description: z.string().optional(),
    why: z.string().optional(),

    phone: z.string().optional(),
    text_instructions: z.string().optional(),
    sms_number: z.string().optional(),

    chat_url: z.string().optional(),
    website_url: z.string().optional(),

    availability: z.string().optional(),
    is_24_7: z.boolean().optional(),

    timezone: z.string().optional(),
    opening_hours_osm: z.string().optional(),
    hours_confidence: z.string().optional(),

    languages: z.array(z.string()).optional(),
    country_codes: z.array(z.string()).optional(),

    resource_kind: z.string().optional(),
    service_scope: z.array(z.string()).optional(),
    population_served: z.array(z.string()).optional(),

    priority_tier: z.string().optional(),
    tags: z.array(z.string()).optional(),
    prominence: z.string().optional(),
  })
  .passthrough();

const NopeEvaluateResponseSchema = z.object({
  risks: z.array(NopeRiskSchema),
  rationale: z.string().optional(),

  speaker_severity: SeveritySchema,
  speaker_imminence: ImminenceSchema,

  show_resources: z.boolean(),

  request_id: z.string(),
  timestamp: z.string(),

  resources: z
    .object({
      primary: NopeResourceSchema.optional(),
      secondary: z.array(NopeResourceSchema).optional(),
    })
    .optional(),

  metadata: z
    .object({
      api_version: z.string().optional(),
      input_format: z
        .enum(["structured", "text_blob"])
        .optional(),
      messages_truncated: z.boolean().optional(),
    })
    .optional(),
});

const AppResourceSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  why: z.string().optional(),
  phone: z.string().optional(),
  url: z.string().optional(),
  address: z.string().optional(),
  availability: z.string().optional(),
  isCrisis: z.boolean().optional(),
});

function normalizeResource(resource, { isCrisis = false } = {}) {
  if (!resource || typeof resource !== "object") {
    return null;
  }

  if (typeof resource.name !== "string" || !resource.name.trim()) {
    return null;
  }

  const url =
    typeof resource.chat_url === "string" &&
    resource.chat_url.trim()
      ? resource.chat_url.trim()
      : typeof resource.website_url === "string" &&
          resource.website_url.trim()
        ? resource.website_url.trim()
        : undefined;

  const normalized = {
    name: resource.name.trim(),

    ...(typeof resource.description === "string" &&
    resource.description.trim()
      ? { description: resource.description.trim() }
      : {}),

    ...(typeof resource.why === "string" &&
    resource.why.trim()
      ? { why: resource.why.trim() }
      : {}),

    ...(typeof resource.phone === "string" &&
    resource.phone.trim()
      ? { phone: resource.phone.trim() }
      : {}),

    ...(url ? { url } : {}),

    ...(typeof resource.availability === "string" &&
    resource.availability.trim()
      ? { availability: resource.availability.trim() }
      : {}),

    ...(isCrisis ? { isCrisis: true } : {}),
  };

  return AppResourceSchema.parse(normalized);
}

function extractResources(data) {
  if (!data?.show_resources || !data?.resources) {
    return [];
  }

  const resources = [];

  if (data.resources.primary) {
    const primary = normalizeResource(data.resources.primary, {
      isCrisis: true,
    });

    if (primary) {
      resources.push(primary);
    }
  }

  if (Array.isArray(data.resources.secondary)) {
    for (const resource of data.resources.secondary) {
      const normalized = normalizeResource(resource, {
        isCrisis: true,
      });

      if (normalized) {
        resources.push(normalized);
      }
    }
  }

  return resources;
}

export async function evaluateSafety(
  messages,
  country = "US"
) {
  if (!Array.isArray(messages)) {
    return {
      isCrisis: false,
      severity: "none",
      imminence: "not_applicable",
      matchedResources: [],
      evaluationAvailable: false,
    };
  }

  if (!NOPE_API_KEY) {
    console.error(
      "NOPE_API_KEY is not configured."
    );

    return {
      isCrisis: false,
      severity: "none",
      imminence: "not_applicable",
      matchedResources: [],
      evaluationAvailable: false,
    };
  }

  const normalizedCountry =
    typeof country === "string" &&
    /^[A-Z]{2}$/.test(country.toUpperCase())
      ? country.toUpperCase()
      : "US";

  try {
    const response = await fetch(
      `${NOPE_BASE_URL}/v1/evaluate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${NOPE_API_KEY}`,
        },
        body: JSON.stringify({
          messages,
          config: {
            country: normalizedCountry,
            include_resources: true,
          },
        }),
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        `NOPE API evaluation failed (${response.status}):`,
        errorText
      );

      return {
        isCrisis: false,
        severity: "none",
        imminence: "not_applicable",
        matchedResources: [],
        evaluationAvailable: false,
      };
    }

    const rawData = await response.json();

    const parsed =
      NopeEvaluateResponseSchema.safeParse(rawData);

    if (!parsed.success) {
      console.error(
        "NOPE response failed Zod validation:",
        parsed.error.flatten()
      );

      return {
        isCrisis: false,
        severity: "none",
        imminence: "not_applicable",
        matchedResources: [],
        evaluationAvailable: false,
      };
    }

    const data = parsed.data;

    const isCrisis =
      data.speaker_severity !== "none";

    const matchedResources =
      extractResources(data);

    if (process.env.NODE_ENV !== "production") {
      console.log("NOPE evaluation:", {
        requestId: data.request_id,
        speakerSeverity: data.speaker_severity,
        speakerImminence: data.speaker_imminence,
        riskCount: data.risks.length,
        showResources: data.show_resources,
        resourceCount: matchedResources.length,
      });
    }

    return {
      isCrisis,
      severity: data.speaker_severity,
      imminence: data.speaker_imminence,
      matchedResources,
      evaluationAvailable: true,
      requestId: data.request_id,
    };
  } catch (error) {
    console.error(
      "Failed to evaluate safety with NOPE:",
      error
    );

    return {
      isCrisis: false,
      severity: "none",
      imminence: "not_applicable",
      matchedResources: [],
      evaluationAvailable: false,
    };
  }
}

export async function signpostResources({
  query,
  country = "US",
}) {
  if (!NOPE_API_KEY) {
    console.error(
      "NOPE_API_KEY is not configured."
    );

    return [];
  }

  const normalizedCountry =
    typeof country === "string" &&
    /^[A-Z]{2}$/.test(country.toUpperCase())
      ? country.toUpperCase()
      : "US";

  const normalizedQuery =
    typeof query === "string"
      ? query.trim().slice(0, 500)
      : "";

  try {
    const params = new URLSearchParams({
      country: normalizedCountry,
      scopes: "mental_health",
      limit: "10",
    });

    if (normalizedQuery) {
      params.set("query", normalizedQuery);
    }

    const response = await fetch(
      `${NOPE_BASE_URL}/v1/signpost/smart?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${NOPE_API_KEY}`,
        },
        signal: AbortSignal.timeout(15_000),
      }
    );

    if (!response.ok) {
      console.error(
        "NOPE Signpost error:",
        response.status,
        await response.text()
      );

      return [];
    }

    const data = await response.json();

    const rawResources = Array.isArray(data)
      ? data
      : Array.isArray(data.resources)
        ? data.resources
        : Array.isArray(data.results)
          ? data.results
          : [];

    return rawResources
      .map((resource) =>
        normalizeResource(resource)
      )
      .filter(Boolean);
  } catch (error) {
    console.error(
      "Failed to fetch NOPE Signpost resources:",
      error
    );

    return [];
  }
}