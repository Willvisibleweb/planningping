'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { SERVICE_OPTIONS, SECTOR_OPTIONS, STAGE_OPTIONS } from '@/lib/opportunities/profileOptions'

const SERVICES = new Set(SERVICE_OPTIONS.map((o) => o.value))
const SECTORS = new Set(SECTOR_OPTIONS.map((o) => o.value))
const STAGES = new Set(STAGE_OPTIONS.map((o) => o.value))

function cleanText(value: FormDataEntryValue | null, max = 1000): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  return text ? text.slice(0, max) : null
}

function cleanArray(formData: FormData, key: string, allowed: Set<string>): string[] {
  return formData
    .getAll(key)
    .filter((v): v is string => typeof v === 'string' && allowed.has(v))
}

function cleanNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export async function saveOpportunityProfile(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const name = cleanText(formData.get('name'), 140) || 'My company'
  const operatingRadiusMiles = cleanNumber(formData.get('operatingRadiusMiles'))
  const minProjectSize = cleanNumber(formData.get('minProjectSize'))
  const maxProjectSize = cleanNumber(formData.get('maxProjectSize'))
  const minResidentialUnits = cleanNumber(formData.get('minResidentialUnits'))
  const maxResidentialUnits = cleanNumber(formData.get('maxResidentialUnits'))

  if (minProjectSize !== null && maxProjectSize !== null && minProjectSize > maxProjectSize) {
    return { error: 'Minimum project value must be lower than the maximum.' }
  }
  if (minResidentialUnits !== null && maxResidentialUnits !== null && minResidentialUnits > maxResidentialUnits) {
    return { error: 'Minimum units must be lower than the maximum.' }
  }

  const id = cleanText(formData.get('id'), 80)
  const row = {
    user_id: user.id,
    name,
    is_primary: true,
    profile_kind: 'own_company',
    primary_services: cleanArray(formData, 'primaryServices', SERVICES),
    secondary_services: cleanArray(formData, 'secondaryServices', SERVICES),
    base_location: cleanText(formData.get('baseLocation'), 160),
    operating_radius_miles: operatingRadiusMiles,
    regions: cleanText(formData.get('regions'), 500),
    preferred_sectors: cleanArray(formData, 'preferredSectors', SECTORS),
    preferred_project_types: cleanText(formData.get('preferredProjectTypes'), 500),
    min_project_size: minProjectSize,
    max_project_size: maxProjectSize,
    min_residential_units: minResidentialUnits,
    max_residential_units: maxResidentialUnits,
    typical_package_value: cleanText(formData.get('typicalPackageValue'), 180),
    unwanted_work: cleanText(formData.get('unwantedWork'), 500),
    preferred_stages: cleanArray(formData, 'preferredStages', STAGES),
    preferred_clients: cleanText(formData.get('preferredClients'), 500),
  }

  const { error } = id
    ? await supabase.from('opportunity_profiles').update(row).eq('id', id).eq('user_id', user.id)
    : await supabase.from('opportunity_profiles').insert(row)

  if (error) return { error: 'Could not save your opportunity profile. Please try again.' }

  revalidatePath('/dashboard')
  revalidatePath('/leads')
  revalidatePath('/settings')
  return {}
}
