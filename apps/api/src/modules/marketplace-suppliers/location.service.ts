import { BadGatewayException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import type { RefillCurrency } from './razorpay.service.js';

const EURO_COUNTRIES = new Set([
  'AT', 'BE', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT', 'LU',
  'MT', 'NL', 'PT', 'SK', 'SI', 'ES',
]);

export function currencyForCountry(countryCode: string): RefillCurrency {
  const code = countryCode.toUpperCase();
  if (code === 'IN') return 'INR';
  if (code === 'GB') return 'GBP';
  if (code === 'AE') return 'AED';
  if (code === 'SG') return 'SGD';
  if (EURO_COUNTRIES.has(code)) return 'EUR';
  return 'USD';
}

type AddressComponent = { longText?: string; shortText?: string; types?: string[] };
type GeocodeResponse = { results?: Array<{ formattedAddress?: string; addressComponents?: AddressComponent[] }> };

@Injectable()
export class LocationService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async detect(latitude: number, longitude: number) {
    const key = this.config.GOOGLE_MAPS_API_KEY;
    if (!key) throw new ServiceUnavailableException('Google Maps location detection is not configured');
    const url = new URL('https://geocode.googleapis.com/v4/geocode/location');
    url.searchParams.set('location.latitude', String(latitude));
    url.searchParams.set('location.longitude', String(longitude));
    const response = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'results.formattedAddress,results.addressComponents',
      },
    });
    if (!response.ok) throw new BadGatewayException('Google Maps could not resolve this location');
    const body = await response.json() as GeocodeResponse;
    const result = body.results?.[0];
    const components = result?.addressComponents ?? [];
    const component = (type: string) => components.find((candidate) => candidate.types?.includes(type));
    const country = component('country');
    const countryCode = country?.shortText?.toUpperCase();
    if (!countryCode) throw new BadGatewayException('Google Maps did not return a country');
    return {
      formattedAddress: result?.formattedAddress ?? country?.longText ?? countryCode,
      countryCode,
      country: country?.longText ?? countryCode,
      city: component('locality')?.longText ?? component('administrative_area_level_2')?.longText ?? null,
      region: component('administrative_area_level_1')?.longText ?? null,
      suggestedCurrency: currencyForCountry(countryCode),
    };
  }
}
