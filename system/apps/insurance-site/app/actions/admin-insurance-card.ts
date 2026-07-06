'use server'

import { createClient } from '@supabase/supabase-js'
import { getSupabaseProjectUrl } from '@/lib/supabase/admin-env'
import {
  classifyInsuranceCardUpload,
  removeStaleInsuranceCardObjects,
} from '@/lib/insurance-card-format'

const BUCKET = 'insurance-cards'

export async function uploadInsuranceCardPdfAdminAction (
  userId: string,
  formData: FormData
): Promise<
  | { ok: true; storagePath: string }
  | { ok: false; message: string }
> {
  const url = getSupabaseProjectUrl()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    return {
      ok: false,
      message:
        'Missing SUPABASE URL or SUPABASE_SERVICE_ROLE_KEY. Add them to the server environment.',
    }
  }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Choose a PDF or image file.' }
  }

  const classified = classifyInsuranceCardUpload(file)
  if (!classified.ok) {
    return { ok: false, message: classified.message }
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  await removeStaleInsuranceCardObjects(
    admin,
    BUCKET,
    userId,
    classified.objectName
  )

  const storagePath = `${userId}/${classified.objectName}`
  const buf = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, buf, {
    contentType: classified.contentType,
    upsert: true,
  })

  if (upErr) {
    return { ok: false, message: `Upload failed: ${upErr.message}` }
  }

  const { error: dbErr } = await admin
    .from('profiles')
    .update({ insurance_card_pdf_path: storagePath })
    .eq('id', userId)

  if (dbErr) {
    return { ok: false, message: dbErr.message }
  }

  return { ok: true, storagePath }
}

