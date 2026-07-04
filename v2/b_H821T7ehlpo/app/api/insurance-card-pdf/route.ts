import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { contentTypeForInsuranceCardPath } from '@/lib/insurance-card-format'
import { insuranceCardDownloadFilename } from '@/lib/pdf-download-name'
import { getSupabaseProjectUrl } from '@/lib/supabase/admin-env'

const BUCKET = 'insurance-cards'
export const runtime = 'nodejs'

function contentDisposition (filename: string, inline: boolean): string {
  const safe = filename.replace(/[\r\n"]/g, '_')
  const encoded = encodeURIComponent(filename)
  const mode = inline ? 'inline' : 'attachment'
  return `${mode}; filename="${safe}"; filename*=UTF-8''${encoded}`
}

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

    // Use service role for storage reads (more reliable on mobile + Vercel), but
    // enforce ownership in app logic so users can only read their own object.
    const admin = createAdminClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    let path: string | null = null
    let displayName = ''

    if (requestedVehicleId) {
      const { data: veh, error: vehErr } = await admin
        .from('vehicles')
        .select('id, user_id, vehicle_name, insurance_card_pdf_path')
        .eq('id', requestedVehicleId)
        .maybeSingle()
      if (vehErr || !veh) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      if (veh.user_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const vehPath = (veh as { insurance_card_pdf_path?: string | null }).insurance_card_pdf_path
      if (!vehPath) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      path = vehPath
      displayName = String((veh as { vehicle_name?: string }).vehicle_name ?? '') || ''
    }

    if (!path) {
      const { data: profile, error: profileErr } = await admin
        .from('profiles')
        .select('name, insurance_card_pdf_path')
        .eq('id', user.id)
        .maybeSingle()

      if (profileErr || !profile?.insurance_card_pdf_path) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      path = profile.insurance_card_pdf_path as string
      displayName = typeof profile.name === 'string' ? profile.name : ''
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
    const pdfBytes = await blob.arrayBuffer()
    const body = new Uint8Array(pdfBytes)
    const mime = contentTypeForInsuranceCardPath(path)

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Disposition': contentDisposition(filename, inline),
        'Content-Length': String(body.byteLength),
        'Cache-Control': 'private, no-store',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
