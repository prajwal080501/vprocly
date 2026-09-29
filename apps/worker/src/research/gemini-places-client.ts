import type { SupplierCandidate, SupplierResearchClient, SupplierResearchQuery } from './supplier-research-client.js';

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

type GeminiConfig = { geminiApiKey: string; geminiModel: string; placesApiKey: string };

/**
 * Real implementation: Gemini (grounded web search) proposes candidate business names, Google Places
 * verifies each one is a real, currently-operating business and supplies address/phone/website, then a
 * cheap direct fetch of the verified website (falling back to one more Gemini call) tries to find a
 * publishable contact email. Confirm the exact Gemini/Places endpoint and model names against the live docs
 * at deploy time -- these are stable in shape but not guaranteed byte-for-byte here.
 */
export class GeminiPlacesResearchClient implements SupplierResearchClient {
  constructor(private readonly config: GeminiConfig) {}

  async findSuppliers(query: SupplierResearchQuery): Promise<SupplierCandidate[]> {
    const searchQuery = `${query.categoryName} suppliers near ${query.deliveryCity}, ${query.deliveryState} for "${query.itemDescription}"`;
    // Over-ask: several candidates won't survive Places verification or email resolution, so asking for
    // exactly maxResults up front would under-deliver after filtering.
    const names = await this.proposeCandidateNames(searchQuery, Math.max(query.maxResults * 2, 8));

    const researched = await Promise.all(
      names.map(async (name): Promise<SupplierCandidate | null> => {
        const place = await this.verifyPlace(name, query.deliveryCity, query.deliveryState);
        if (!place) return null;
        const email = await this.resolveEmail(place.website);
        if (!email) return null;
        return {
          name: place.name,
          email,
          phone: place.phone,
          city: place.city ?? query.deliveryCity,
          state: place.state ?? query.deliveryState,
          country: place.country,
          website: place.website,
          placeId: place.placeId,
          sourceUrls: place.website ? [place.website] : [],
          searchQuery,
        };
      }),
    );
    return researched.filter((candidate): candidate is SupplierCandidate => candidate !== null).slice(0, query.maxResults);
  }

  private async proposeCandidateNames(searchQuery: string, count: number): Promise<string[]> {
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
                    text: `${searchQuery}. List up to ${count} real, currently-operating businesses that could supply this. One per line, business name only, no numbering or extra commentary.`,
                  },
                ],
              },
            ],
            tools: [{ google_search: {} }],
          }),
        },
      );
      if (!res.ok) throw await upstreamError('Gemini supplier discovery', res);
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      return text
        .split('\n')
        .map((line) => line.replace(/^[-*\d.\s]+/, '').trim())
        .filter(Boolean)
        .slice(0, count);
    } catch (error) {
      throw contextualError('Gemini supplier discovery failed', error);
    }
  }

  private async verifyPlace(
    name: string,
    city: string,
    state: string,
  ): Promise<{ name: string; city: string | null; state: string | null; country: string | null; phone: string | null; website: string | null; placeId: string } | null> {
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
        headers: {
          'content-type': 'application/json',
          'X-Goog-Api-Key': this.config.placesApiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.websiteUri,places.addressComponents',
        },
        body: JSON.stringify({ textQuery: `${name}, ${city}, ${state}` }),
      });
      if (!res.ok) throw await upstreamError('Google Places verification', res);
      const data = (await res.json()) as {
        places?: {
          id: string;
          displayName?: { text?: string };
          internationalPhoneNumber?: string;
          websiteUri?: string;
          addressComponents?: { types?: string[]; longText?: string }[];
        }[];
      };
      const place = data.places?.[0];
      if (!place) return null;
      const component = (type: string) =>
        place.addressComponents?.find((c) => Array.isArray(c.types) && c.types.includes(type))?.longText ?? null;
      return {
        name: place.displayName?.text ?? name,
        city: component('locality'),
        state: component('administrative_area_level_1'),
        country: component('country'),
        phone: place.internationalPhoneNumber ?? null,
        website: place.websiteUri ?? null,
        placeId: place.id,
      };
    } catch (error) {
      throw contextualError('Google Places verification failed', error);
    }
  }

  private async resolveEmail(website: string | null): Promise<string | null> {
    if (!website) return null;
    const fromSite = await this.scrapeEmailFromWebsite(website);
    if (fromSite) return fromSite;
    return this.askGeminiForEmail(website);
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

  private async askGeminiForEmail(website: string): Promise<string | null> {
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
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const match = text.match(EMAIL_PATTERN);
      return match ? match[0] : null;
    } catch (error) {
      throw contextualError('Gemini email lookup failed', error);
    }
  }
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
