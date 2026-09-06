/**
 * NHTSA vPIC — free, no API key.
 * @see https://vpic.nhtsa.dot.gov/api/
 */

const VPIC_DECODE =
  'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended'

/** VIN uses A–Z (except I, O, Q) and 0–9, exactly 17 chars. */
export function normalizeVin (raw: string): string | null {
  const v = raw.trim().toUpperCase().replace(/\s+/g, '')
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return null
  return v
}

function cleanNhtsa (v: unknown): string {
  const s = String(v ?? '').trim()
  if (!s || /^not applicable$/i.test(s) || /^unknown$/i.test(s)) return ''
  return s
}

function titleCaseToken (word: string): string {
  if (!word) return ''
  const lower = word.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/** Human-friendly vehicle line for emails and UI. */
export function formatSuggestedVehicleName (
  modelYear: string,
  vehicleMake: string,
  vehicleModel: string
): string {
  const y = cleanNhtsa(modelYear)
  const mk = vehicleMake
    .split(/\s+/)
    .filter(Boolean)
    .map(titleCaseToken)
    .join(' ')
  const md = vehicleModel
    .split(/\s+/)
    .filter(Boolean)
    .map(titleCaseToken)
    .join(' ')
  return [y, mk, md].filter(Boolean).join(' ').trim()
}

export type DecodedVinPayload = {
  vin: string
  suggestedVehicleName: string
  modelYear: string
  vehicleMake: string
  vehicleModel: string
  trimLevel: string
  bodyClass: string
  driveType: string
  fuelTypePrimary: string
  nhtsaErrorCode: string
}

type NhtsaRow = Record<string, string>

export async function decodeVinFromNhtsa (
  vin: string
): Promise<
  | { ok: true; data: DecodedVinPayload }
  | { ok: false; error: string }
> {
  const normalized = normalizeVin(vin)
  if (!normalized) {
    return {
      ok: false,
      error:
        'VIN must be exactly 17 characters (letters A–Z except I, O, Q, and digits 0–9).',
    }
  }

  const url = `${VPIC_DECODE}/${encodeURIComponent(normalized)}?format=json`
  let res: Response
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
  } catch {
    return { ok: false, error: 'Could not reach NHTSA VIN database.' }
  }

  if (!res.ok) {
    return { ok: false, error: `NHTSA returned HTTP ${res.status}.` }
  }

  let json: { Results?: NhtsaRow[] }
  try {
    json = (await res.json()) as { Results?: NhtsaRow[] }
  } catch {
    return { ok: false, error: 'Invalid response from NHTSA.' }
  }

  const row = json.Results?.[0]
  if (!row) {
    return { ok: false, error: 'No decode result from NHTSA.' }
  }

  const modelYear = cleanNhtsa(row.ModelYear)
  const vehicleMake = cleanNhtsa(row.Make)
  const vehicleModel = cleanNhtsa(row.Model)
  const trimLevel = cleanNhtsa(row.Trim)
  const bodyClass = cleanNhtsa(row.BodyClass)
  const driveType = cleanNhtsa(row.DriveType)
  const fuelTypePrimary = cleanNhtsa(row.FuelTypePrimary)
  const nhtsaErrorCode = cleanNhtsa(row.ErrorCode) || '0'

  const suggestedVehicleName = formatSuggestedVehicleName(
    modelYear,
    vehicleMake,
    vehicleModel
  )

  return {
    ok: true,
    data: {
      vin: normalized,
      suggestedVehicleName:
        suggestedVehicleName || `${vehicleMake} ${vehicleModel}`.trim() || normalized,
      modelYear,
      vehicleMake,
      vehicleModel,
      trimLevel,
      bodyClass,
      driveType,
      fuelTypePrimary,
      nhtsaErrorCode,
    },
  }
}
