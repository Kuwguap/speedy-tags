import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { contentDispositionHeader } from '@/lib/content-disposition'
import { contentTypeForInsuranceCardPath } from '@/lib/insurance-card-format'
import { resolveInsuranceCardStoragePath } from '@/lib/insurance-card-storage'
import { insuranceCardDownloadFilename } from '@/lib/pdf-download-name'
import { getSupabaseProjectUrl } from '@/lib/supabase/admin-env'

const BUCKET = 'insurance-cards'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET (request: Request) {
  const parsed = new URL(request.url)
  const inline = parsed.searchParams.get('inline') === '1'
  const requestedVehicleId = parsed.searchParams.get('vehicleId')?.trim() || null

  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = getSupabaseProjectUrl()
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    if (!url || !key) {
      return NextResponse.json({ error: 'Server env misconfigured' }, { status: 500 })
    }

    const admin = createAdminClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: profile } = await admin
      .from('profiles')
      .select('name, insurance_card_pdf_path')
      .eq('id', user.id)
      .maybeSingle()

    const profilePath =
      (profile as { insurance_card_pdf_path?: string | null } | null)
        ?.insurance_card_pdf_path ?? null
    let displayName =
      typeof (profile as { name?: string } | null)?.name === 'string'
        ? (profile as { name: string }).name
        : ''

    let storedPath: string | null = null
    if (requestedVehicleId) {
      const { data: veh } = await admin
        .from('vehicles')
        .select('id, user_id, vehicle_name, insurance_card_pdf_path')
        .eq('id', requestedVehicleId)
        .maybeSingle()
      if (!veh || veh.user_id !== user.id) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      storedPath =
        (veh as { insurance_card_pdf_path?: string | null }).insurance_card_pdf_path ??
        null
      const vehName = String((veh as { vehicle_name?: string }).vehicle_name ?? '')
      if (vehName) displayName = vehName
    }

    const path = await resolveInsuranceCardStoragePath(admin, user.id, {
      vehicleId: requestedVehicleId,
      storedPath,
      profilePath,
    })

    if (!path) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (!path.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: blob, error: dlErr } = await admin.storage
      .from(BUCKET)
      .download(path)

    if (dlErr || !blob) {
      return NextResponse.json({ error: 'Could not load file' }, { status: 502 })
    }

    const filename = insuranceCardDownloadFilename(
      displayName || 'Insurance card',
      path
    )
    const mime = contentTypeForInsuranceCardPath(path)

    return new NextResponse(blob, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Disposition': contentDispositionHeader(filename, inline),
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    console.error('[insurance-card-pdf]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
