import type { SupplierCandidate, SupplierResearchClient, SupplierResearchQuery, SupplierResearchResult } from './supplier-research-client.js';
import { buildResearchPlan, rankResearchCandidates } from './research-plan.js';

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

type GeminiConfig = {
  geminiApiKey: string;
  geminiModel: string;
  placesApiKey: string;
  geminiInputCostMicrosPerMillion?: number;
  geminiOutputCostMicrosPerMillion?: number;
  geminiSearchCostMicros?: number;
  placeDetailsCostMicros?: number;
};
type GeminiUsage = { inputTokens: number; outputTokens: number; groundingQueries: number };
type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    groundingMetadata?: {
      groundingChunks?: { web?: { uri?: string } }[];
      webSearchQueries?: string[];
    };
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
};
type VerifiedPlace = {
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
  website: string | null;
  placeId: string;
};
type PlaceVerification = { place: VerifiedPlace | null; idSearches: number; detailCalls: number; duplicate: boolean };
type CandidateResearchResult = { candidate: SupplierCandidate | null; verification: PlaceVerification; emailUsage: GeminiUsage };
const zeroGeminiUsage: GeminiUsage = { inputTokens: 0, outputTokens: 0, groundingQueries: 0 };
type CandidateProposal = {
  name: string;
  matchedIdentifiers: string[];
  matchReasons: string[];
  sourceUrls: string[];
};

/**
 * Real implementation: Gemini (grounded web search) proposes candidate business names, Google Places
 * verifies each one is a real, currently-operating business and supplies address/phone/website, then a
 * cheap direct fetch of the verified website (falling back to one more Gemini call) tries to find a
 * publishable contact email. Confirm the exact Gemini/Places endpoint and model names against the live docs
 * at deploy time -- these are stable in shape but not guaranteed byte-for-byte here.
 */
export class GeminiPlacesResearchClient implements SupplierResearchClient {
  constructor(private readonly config: GeminiConfig) {}

  async findSuppliers(query: SupplierResearchQuery): Promise<SupplierResearchResult> {
    const startedAt = Date.now();
    const plan = buildResearchPlan(query);
    const candidates: SupplierCandidate[] = [];
    const seenNames = new Set<string>();
    const seenPlaces = new Set<string>();
    let placesLookups = 0;
    let queryCount = 0;
    let geminiCalls = 0;
    let geminiInputTokens = 0;
    let geminiOutputTokens = 0;
    let groundingQueries = 0;
    let placesIdSearches = 0;
    let placesDetailCalls = 0;
    let duplicatesRemoved = 0;
    const maximumPlacesLookups = Math.max(query.maxResults * 4, 12);

    for (let iteration = 0; iteration < plan.length && candidates.length < query.maxResults && placesLookups < maximumPlacesLookups; iteration++) {
      const step = plan[iteration]!;
      const remaining = query.maxResults - candidates.length;
      queryCount++;
      geminiCalls++;
      const proposalResult = await this.proposeCandidates(step.query, Math.max(remaining * 2, 6), query);
      geminiInputTokens += proposalResult.usage.inputTokens;
      geminiOutputTokens += proposalResult.usage.outputTokens;
      groundingQueries += proposalResult.usage.groundingQueries;
      const unseen = proposalResult.proposals.filter((proposal) => {
        const key = proposal.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!key || seenNames.has(key)) {
          duplicatesRemoved++;
          return false;
        }
        seenNames.add(key);
        return true;
      }).slice(0, maximumPlacesLookups - placesLookups);
      placesLookups += unseen.length;

      const researched = await Promise.all(
        unseen.map(async (proposal): Promise<CandidateResearchResult> => {
          const verification = await this.verifyPlace(proposal.name, query.deliveryCity, query.deliveryState, seenPlaces);
          if (verification.duplicate) duplicatesRemoved++;
          if (!verification.place) return { candidate: null, verification, emailUsage: zeroGeminiUsage };
          const place = verification.place;
          const resolvedEmail = await this.resolveEmail(place.website);
          if (resolvedEmail.usedGemini) geminiCalls++;
          if (!resolvedEmail.email) return { candidate: null, verification, emailUsage: resolvedEmail.usage };
          const sourceUrls = uniqueUrls([...proposal.sourceUrls, ...(place.website ? [place.website] : [])]);
          const itemMatchScore = calculateItemMatch(query, proposal, iteration);
          const evidenceScore = Math.min(1, (proposal.sourceUrls.length > 0 ? 0.65 : 0.35) + (place.website ? 0.15 : 0));
          return { candidate: {
            name: place.name,
            email: resolvedEmail.email,
            phone: place.phone,
            city: place.city ?? query.deliveryCity,
            state: place.state ?? query.deliveryState,
            country: place.country,
            website: place.website,
            placeId: place.placeId,
            sourceUrls,
            searchQuery: step.query,
            itemMatchScore,
            evidenceScore,
            matchedIdentifiers: proposal.matchedIdentifiers,
            matchReasons: proposal.matchReasons,
            researchIteration: iteration + 1,
            sourceType: proposal.sourceUrls.length > 0 ? 'supplier_website' : 'google_places',
          }, verification, emailUsage: resolvedEmail.usage };
        }),
      );
      for (const result of researched) {
        placesIdSearches += result.verification.idSearches;
        placesDetailCalls += result.verification.detailCalls;
        geminiInputTokens += result.emailUsage.inputTokens;
        geminiOutputTokens += result.emailUsage.outputTokens;
        groundingQueries += result.emailUsage.groundingQueries;
        if (result.candidate) candidates.push(result.candidate);
      }
    }

    const ranked = rankResearchCandidates(candidates, query).slice(0, query.maxResults);
    const stopReason = ranked.length >= query.maxResults
      ? 'target_reached'
      : placesLookups >= maximumPlacesLookups
        ? 'places_budget_exhausted'
        : 'plan_exhausted';
    return {
      candidates: ranked,
      metrics: {
        queryCount,
        geminiCalls,
        geminiInputTokens,
        geminiOutputTokens,
        groundingQueries,
        placesCalls: placesIdSearches + placesDetailCalls,
        placesIdSearches,
        placesDetailCalls,
        duplicatesRemoved,
        durationMs: Date.now() - startedAt,
        estimatedCostMicros: Math.round(
          geminiInputTokens * (this.config.geminiInputCostMicrosPerMillion ?? 0) / 1_000_000
          + geminiOutputTokens * (this.config.geminiOutputCostMicrosPerMillion ?? 0) / 1_000_000
          + groundingQueries * (this.config.geminiSearchCostMicros ?? 0)
          + placesDetailCalls * (this.config.placeDetailsCostMicros ?? 0),
        ),
        stopReason,
      },
    };
  }

  private async proposeCandidates(searchQuery: string, count: number, item: SupplierResearchQuery): Promise<{ proposals: CandidateProposal[]; usage: GeminiUsage }> {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.config.geminiModel}:generateContent?key=${this.config.geminiApiKey}`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(20_000),
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Research suppliers for this exact item using this search strategy: ${searchQuery}\n
Item code: ${item.itemCode ?? 'unknown'}
Brand/manufacturer: ${item.brandManufacturer ?? 'unknown'}
HSN/manufacturer code: ${item.hsnMfgCode ?? 'unknown'}
Description/specification: ${item.itemDescription}

Return up to ${count} currently operating businesses. Prefer manufacturers and authorized distributors
with explicit evidence for the item code or specifications. Return ONLY a JSON array with this shape:
[{"name":"business name","matchedIdentifiers":["codes explicitly found"],"matchReasons":["short evidence-based reason"],"sourceUrls":["public evidence URL"]}].
Do not invent codes, URLs, authorization, stock, or capabilities. Use empty arrays when evidence is absent.`,
                  },
                ],
              },
            ],
            tools: [{ google_search: {} }],
          }),
        },
      );
      if (!res.ok) throw await upstreamError('Gemini supplier discovery', res);
      const data = (await res.json()) as GeminiResponse;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const groundingUrls = data.candidates?.[0]?.groundingMetadata?.groundingChunks
        ?.map((chunk) => chunk.web?.uri)
        .filter((url): url is string => Boolean(url)) ?? [];
      return { proposals: parseProposals(text, groundingUrls).slice(0, count), usage: readGeminiUsage(data) };
    } catch (error) {
      throw contextualError('Gemini supplier discovery failed', error);
    }
  }

  private async verifyPlace(
    name: string,
    city: string,
    state: string,
    seenPlaces: Set<string>,
  ): Promise<PlaceVerification> {
    try {
      // Stage 1 requests only the ID. Text Search Essentials (IDs Only) is free under the India price
      // sheet; contact fields are fetched only for the selected place in stage 2.
      const searchResponse = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
        headers: {
          'content-type': 'application/json',
          'X-Goog-Api-Key': this.config.placesApiKey,
          'X-Goog-FieldMask': 'places.id',
        },
        body: JSON.stringify({ textQuery: `${name}, ${city}, ${state}` }),
      });
      if (!searchResponse.ok) throw await upstreamError('Google Places ID search', searchResponse);
      const searchData = (await searchResponse.json()) as { places?: { id: string }[] };
      const placeId = searchData.places?.[0]?.id;
      if (!placeId) return { place: null, idSearches: 1, detailCalls: 0, duplicate: false };
      // Reserve the ID before the paid lookup so aliases returned in the same parallel batch cannot each
      // trigger a Place Details charge for the same business.
      if (seenPlaces.has(placeId)) return { place: null, idSearches: 1, detailCalls: 0, duplicate: true };
      seenPlaces.add(placeId);

      const detailsResponse = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
        signal: AbortSignal.timeout(15_000),
        headers: {
          'X-Goog-Api-Key': this.config.placesApiKey,
          'X-Goog-FieldMask': 'id,displayName,formattedAddress,internationalPhoneNumber,websiteUri,addressComponents',
        },
      });
      if (!detailsResponse.ok) throw await upstreamError('Google Place Details verification', detailsResponse);
      const place = (await detailsResponse.json()) as {
        id: string;
        displayName?: { text?: string };
        internationalPhoneNumber?: string;
        websiteUri?: string;
        addressComponents?: { types?: string[]; longText?: string }[];
      };
      const component = (type: string) =>
        place.addressComponents?.find((c) => Array.isArray(c.types) && c.types.includes(type))?.longText ?? null;
      return { place: {
        name: place.displayName?.text ?? name,
        city: component('locality'),
        state: component('administrative_area_level_1'),
        country: component('country'),
        phone: place.internationalPhoneNumber ?? null,
        website: place.websiteUri ?? null,
        placeId: place.id ?? placeId,
      }, idSearches: 1, detailCalls: 1, duplicate: false };
    } catch (error) {
      throw contextualError('Google Places verification failed', error);
    }
  }

  private async resolveEmail(website: string | null): Promise<{ email: string | null; usedGemini: boolean; usage: GeminiUsage }> {
    if (!website) return { email: null, usedGemini: false, usage: zeroGeminiUsage };
    const fromSite = await this.scrapeEmailFromWebsite(website);
    if (fromSite) return { email: fromSite, usedGemini: false, usage: zeroGeminiUsage };
    const result = await this.askGeminiForEmail(website);
    return { email: result.email, usedGemini: true, usage: result.usage };
  }

  private async scrapeEmailFromWebsite(website: string): Promise<string | null> {
    try {
      const res = await fetch(website, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const html = await res.text();
      const match = html.match(EMAIL_PATTERN);
      return match ? match[0] : null;
    } catch {
      return null;
    }
  }

  private async askGeminiForEmail(website: string): Promise<{ email: string | null; usage: GeminiUsage }> {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.config.geminiModel}:generateContent?key=${this.config.geminiApiKey}`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(20_000),
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `What is a public contact or sales email address for the business at ${website}? Reply with only the email address, or "none" if you cannot find one.` }] }],
            tools: [{ google_search: {} }],
          }),
        },
      );
      if (!res.ok) throw await upstreamError('Gemini email lookup', res);
      const data = (await res.json()) as GeminiResponse;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const match = text.match(EMAIL_PATTERN);
      return { email: match ? match[0] : null, usage: readGeminiUsage(data) };
    } catch (error) {
      throw contextualError('Gemini email lookup failed', error);
    }
  }
}

function parseProposals(text: string, groundingUrls: string[]): CandidateProposal[] {
  const grounded = new Set(groundingUrls);
  const json = text.match(/\[[\s\S]*\]/)?.[0];
  if (json) {
    try {
      const values = JSON.parse(json) as unknown[];
      return values.flatMap((value): CandidateProposal[] => {
        if (!value || typeof value !== 'object') return [];
        const row = value as Record<string, unknown>;
        if (typeof row.name !== 'string' || !row.name.trim()) return [];
        const strings = (input: unknown) => Array.isArray(input) ? input.filter((entry): entry is string => typeof entry === 'string') : [];
        return [{
          name: row.name.trim(),
          matchedIdentifiers: strings(row.matchedIdentifiers),
          matchReasons: strings(row.matchReasons),
          // Keep explicit per-supplier URLs. Grounding URLs are accepted when the response references the
          // same URI, but are never sprayed across every candidate as if each source supported every claim.
          sourceUrls: uniqueUrls(strings(row.sourceUrls)).filter((url) => grounded.size === 0 || grounded.has(url) || !url.includes('googleusercontent.com')),
        }];
      });
    } catch {
      // Fall through to the defensive line parser for non-conforming model output.
    }
  }
  return text.split('\n').map((line) => line.replace(/^[-*\d.\s]+/, '').trim()).filter(Boolean).map((name) => ({
    name,
    matchedIdentifiers: [],
    matchReasons: [],
    sourceUrls: [],
  }));
}

function calculateItemMatch(query: SupplierResearchQuery, proposal: CandidateProposal, iteration: number): number {
  const identifiers = proposal.matchedIdentifiers.map((value) => value.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const expected = [query.itemCode, query.hsnMfgCode].filter((value): value is string => Boolean(value)).map((value) => value.toLowerCase().replace(/[^a-z0-9]/g, ''));
  if (expected.some((value) => identifiers.includes(value))) return 0.95;
  if (proposal.matchReasons.length > 0 && iteration === 0) return 0.75;
  if (proposal.matchReasons.length > 0) return 0.6;
  return iteration === 0 ? 0.45 : 0.3;
}

function uniqueUrls(urls: string[]): string[] {
  return [...new Set(urls.filter((url) => /^https?:\/\//i.test(url)))];
}

function readGeminiUsage(response: GeminiResponse): GeminiUsage {
  const metadata = response.usageMetadata;
  return {
    inputTokens: Math.max(0, metadata?.promptTokenCount ?? 0),
    // Gemini bills generated text and thinking tokens at the output rate.
    outputTokens: Math.max(0, metadata?.candidatesTokenCount ?? 0) + Math.max(0, metadata?.thoughtsTokenCount ?? 0),
    // A grounded prompt may execute more than one billable Google Search query.
    groundingQueries: response.candidates?.reduce(
      (total, candidate) => total + (candidate.groundingMetadata?.webSearchQueries?.length ?? 0),
      0,
    ) ?? 0,
  };
}

async function upstreamError(service: string, response: Response): Promise<Error> {
  let detail = response.statusText;
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    detail = body.error?.message ?? detail;
  } catch {
    // Keep the HTTP status when an upstream returns a non-JSON error page.
  }
  return new Error(`${service} returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
}

function contextualError(message: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(`${message}: ${detail}`, { cause: error });
}
