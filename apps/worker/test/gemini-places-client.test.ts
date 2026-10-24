import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiPlacesResearchClient } from '../src/research/gemini-places-client.js';

afterEach(() => vi.unstubAllGlobals());

describe('GeminiPlacesResearchClient', () => {
  it('stops the bounded loop after an exact-code pass yields enough verified suppliers', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('generativelanguage.googleapis.com')) {
        return Response.json({
          candidates: [{
            content: { parts: [{ text: JSON.stringify([{
              name: 'Exact Bearing Co',
              matchedIdentifiers: ['6205-ZZ-C3'],
              matchReasons: ['Catalogue lists the requested part number'],
              sourceUrls: ['https://exact.example/catalogue/6205-zz-c3'],
            }]) }] },
            groundingMetadata: {
              groundingChunks: [{ web: { uri: 'https://exact.example/catalogue/6205-zz-c3' } }],
              webSearchQueries: ['6205-ZZ-C3 supplier Pune'],
            },
          }],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, thoughtsTokenCount: 10 },
        });
      }
      if (url.endsWith('/v1/places:searchText')) return Response.json({ places: [{ id: 'place-1' }] });
      if (url.endsWith('/v1/places/place-1')) {
        return Response.json({
          id: 'place-1',
          displayName: { text: 'Exact Bearing Co' },
          internationalPhoneNumber: '+91 99999 99999',
          websiteUri: 'https://exact.example',
          addressComponents: [
            { types: ['locality'], longText: 'Pune' },
            { types: ['administrative_area_level_1'], longText: 'Maharashtra' },
            { types: ['country'], longText: 'India' },
          ],
        });
      }
      if (url === 'https://exact.example') return new Response('<a href="mailto:sales@exact.example">Email</a>');
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new GeminiPlacesResearchClient({
      geminiApiKey: 'test',
      geminiModel: 'test-model',
      placesApiKey: 'test',
      geminiInputCostMicrosPerMillion: 1_000_000,
      geminiOutputCostMicrosPerMillion: 2_000_000,
      geminiSearchCostMicros: 1_000,
      placeDetailsCostMicros: 500,
    });
    const result = await client.findSuppliers({
      categoryName: 'Bearings',
      itemCode: '6205-ZZ-C3',
      itemDescription: 'Deep groove ball bearing 25x52x15 mm',
      deliveryCity: 'Pune',
      deliveryState: 'Maharashtra',
      maxResults: 1,
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      name: 'Exact Bearing Co',
      email: 'sales@exact.example',
      itemMatchScore: 0.95,
      matchedIdentifiers: ['6205-ZZ-C3'],
      researchIteration: 1,
    });
    expect(result.metrics).toMatchObject({
      queryCount: 1,
      geminiCalls: 1,
      geminiInputTokens: 100,
      geminiOutputTokens: 60,
      groundingQueries: 1,
      placesCalls: 2,
      placesIdSearches: 1,
      placesDetailCalls: 1,
      estimatedCostMicros: 1_720,
      stopReason: 'target_reached',
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('adds email-lookup tokens and every grounding query to the cost estimate', async () => {
    let geminiCall = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('generativelanguage.googleapis.com')) {
        geminiCall++;
        if (geminiCall === 1) {
          return Response.json({
            candidates: [{
              content: { parts: [{ text: JSON.stringify([{ name: 'Lookup Supplier', matchedIdentifiers: [], matchReasons: ['Matched specification'], sourceUrls: [] }]) }] },
              groundingMetadata: { webSearchQueries: ['supplier query'] },
            }],
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, thoughtsTokenCount: 10 },
          });
        }
        return Response.json({
          candidates: [{
            content: { parts: [{ text: 'sales@lookup.example' }] },
            groundingMetadata: { webSearchQueries: ['lookup contact', 'lookup sales email'] },
          }],
          usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 5 },
        });
      }
      if (url.endsWith('/v1/places:searchText')) return Response.json({ places: [{ id: 'place-2' }] });
      if (url.endsWith('/v1/places/place-2')) return Response.json({ id: 'place-2', displayName: { text: 'Lookup Supplier' }, websiteUri: 'https://lookup.example' });
      if (url === 'https://lookup.example') return new Response('<html>No public email here</html>');
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new GeminiPlacesResearchClient({
      geminiApiKey: 'test', geminiModel: 'test-model', placesApiKey: 'test',
      geminiInputCostMicrosPerMillion: 1_000_000,
      geminiOutputCostMicrosPerMillion: 2_000_000,
      geminiSearchCostMicros: 1_000,
      placeDetailsCostMicros: 500,
    });
    const result = await client.findSuppliers({
      categoryName: 'Components',
      itemDescription: 'Test component',
      deliveryCity: 'Pune',
      deliveryState: 'Maharashtra',
      maxResults: 1,
    });

    expect(result.candidates[0]?.email).toBe('sales@lookup.example');
    expect(result.metrics).toMatchObject({
      geminiCalls: 2,
      geminiInputTokens: 120,
      geminiOutputTokens: 65,
      groundingQueries: 3,
      placesIdSearches: 1,
      placesDetailCalls: 1,
      estimatedCostMicros: 3_750,
    });
  });
});
