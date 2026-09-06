'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import {
  fetchDashboardForUser,
  type BillingAddress,
  type DashboardInsuranceData,
  type DashboardInvoice,
  type DashboardPolicy,
  type DashboardUser,
} from '@/lib/supabase/dashboard-data'
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client'

export interface User {
  id: string
  email: string
  name: string
  phone: string
  memberSince: string
}

export interface CoverageOptions {
  liability: boolean
  collision: boolean
  comprehensive: boolean
  uninsuredMotorist: boolean
  medicalPayments: boolean
  roadsideAssistance: boolean
}

export interface InsuranceData {
  vehicleName: string
  vin: string
  modelYear: string
  vehicleMake: string
  vehicleModel: string
  trimLevel: string
  bodyClass: string
  coverage: CoverageOptions
  premium: number
  policyNumber: string
  policyEffectiveDate: string
  policyExpirationDate: string
  policyAddress: string
  insuranceCardPdfPath?: string | null
}

function mapDashboardToState (u: DashboardUser, i: DashboardInsuranceData) {
  const nextUser: User = {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    memberSince: u.memberSince,
  }
  const nextInsurance: InsuranceData = {
    vehicleName: i.vehicleName,
    vin: i.vin,
    modelYear: i.modelYear,
    vehicleMake: i.vehicleMake,
    vehicleModel: i.vehicleModel,
    trimLevel: i.trimLevel,
    bodyClass: i.bodyClass,
    policyNumber: i.policyNumber,
    premium: i.premium,
    coverage: i.coverage,
    policyEffectiveDate: i.policyEffectiveDate,
    policyExpirationDate: i.policyExpirationDate,
    policyAddress: i.policyAddress,
    insuranceCardPdfPath: i.insuranceCardPdfPath ?? null,
  }
  return { user: nextUser, insuranceData: nextInsurance }
}

interface AuthContextType {
  user: User | null
  insuranceData: InsuranceData | null
  /** All vehicles on the account (oldest → newest). Empty when no coverage yet. */
  vehicles: DashboardInsuranceData[]
  /** Site-wide: when false, member dashboard hides the "Your coverage" block. */
  showDashboardCoverageSection: boolean
  /** Mailing address for receipts + Policy Declaration. */
  billingAddress: BillingAddress
  /** Most-recently-created non-cancelled policy, or null when nothing purchased. */
  activePolicy: DashboardPolicy | null
  /** Every non-cancelled policy on the account (newest → oldest). */
  activePolicies: DashboardPolicy[]
  /** Sum of monthly premiums across every active policy, in cents. */
  totalMonthlyPremiumCents: number
  /** Oldest unpaid invoice driving the "Balance due" panel. */
  openInvoice: DashboardInvoice | null
  /** Every unpaid invoice on the account (oldest due-date first). */
  openInvoices: DashboardInvoice[]
  /** Sum of every unpaid invoice — used as the aggregate balance-due total. */
  openInvoicesTotalCents: number
  /** Up to 24 most-recent invoices, newest first. */
  billingHistory: DashboardInvoice[]
  login: (email: string, password: string) => Promise<boolean>
  signup: (email: string, password: string, name: string) => Promise<void>
  logout: () => Promise<void>
  refreshUserData: () => Promise<void>
  updateUserProfile: (p: { name: string; phone: string }) => Promise<void>
  updateVehicleDetails: (p: {
    vehicleName: string
    vin: string
    modelYear: string
    vehicleMake: string
    vehicleModel: string
    trimLevel: string
    bodyClass: string
  }) => Promise<void>
  updatePassword: (newPassword: string) => Promise<void>
  clients: ClientData[]
  addClient: (client: ClientData) => void
  authReady: boolean
}

const EMPTY_BILLING_ADDRESS: BillingAddress = {
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'US',
}

export interface ClientData {
  id: string
  email: string
  password: string
  name: string
  memberSince: string
  phone: string
  vehicleName: string
  vin: string
  policyNumber: string
  annualPremium: number
  coverage: CoverageOptions
}

/**
 * Typed error surface for `signup()` so the UI can branch on concrete reasons
 * (e.g. "this email already has an account") instead of falling through to a
 * generic "something went wrong" message.
 */
export type SignupErrorCode =
  | 'email_taken'
  | 'password_weak'
  | 'invalid_email'
  | 'rate_limited'
  | 'unknown'

export class SignupError extends Error {
  code: SignupErrorCode
  constructor (code: SignupErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'SignupError'
  }
}

interface SupabaseUserWithIdentities {
  identities?: Array<{ identity_id?: string } | unknown> | null
}

/**
 * Detect Supabase's "obfuscated duplicate" response: when email-confirmation
 * is enabled, `signUp()` for an already-registered address returns 200 with a
 * shadow user whose `identities` array is empty (no AuthApiError is thrown).
 * See https://github.com/supabase/auth/issues/1517 for context.
 */
function isObfuscatedDuplicateUser (user: SupabaseUserWithIdentities | null | undefined): boolean {
  if (!user) return false
  const ids = user.identities
  return Array.isArray(ids) && ids.length === 0
}

function mapSupabaseSignupError (error: { message?: string; status?: number }): SignupError {
  const msg = (error.message ?? '').trim()
  const lower = msg.toLowerCase()
  if (
    lower.includes('already registered') ||
    lower.includes('already exists') ||
    lower.includes('user already')
  ) {
    return new SignupError('email_taken', 'An account with this email already exists.')
  }
  if (lower.includes('rate') || error.status === 429) {
    return new SignupError(
      'rate_limited',
      'Too many sign-up attempts. Please wait a minute and try again.',
    )
  }
  if (lower.includes('password')) {
    return new SignupError(
      'password_weak',
      msg || 'Password is too weak — please choose a stronger one.',
    )
  }
  if (lower.includes('email') && (lower.includes('invalid') || lower.includes('valid'))) {
    return new SignupError('invalid_email', msg || 'Please enter a valid email address.')
  }
  return new SignupError('unknown', msg || 'Failed to create account. Please try again.')
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider ({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [insuranceData, setInsuranceData] = useState<InsuranceData | null>(null)
  const [vehicles, setVehicles] = useState<DashboardInsuranceData[]>([])
  const [showDashboardCoverageSection, setShowDashboardCoverageSection] = useState(true)
  const [billingAddress, setBillingAddress] = useState<BillingAddress>(EMPTY_BILLING_ADDRESS)
  const [activePolicy, setActivePolicy] = useState<DashboardPolicy | null>(null)
  const [activePolicies, setActivePolicies] = useState<DashboardPolicy[]>([])
  const [totalMonthlyPremiumCents, setTotalMonthlyPremiumCents] = useState(0)
  const [openInvoice, setOpenInvoice] = useState<DashboardInvoice | null>(null)
  const [openInvoices, setOpenInvoices] = useState<DashboardInvoice[]>([])
  const [openInvoicesTotalCents, setOpenInvoicesTotalCents] = useState(0)
  const [billingHistory, setBillingHistory] = useState<DashboardInvoice[]>([])
  const [clients, setClients] = useState<ClientData[]>([])
  const [authReady, setAuthReady] = useState(false)

  const applyDashboardRow = useCallback(
    (row: {
      user: DashboardUser
      insuranceData: DashboardInsuranceData
      vehicles: DashboardInsuranceData[]
      showDashboardCoverageSection: boolean
      billingAddress: BillingAddress
      activePolicy: DashboardPolicy | null
      activePolicies: DashboardPolicy[]
      totalMonthlyPremiumCents: number
      openInvoice: DashboardInvoice | null
      openInvoices: DashboardInvoice[]
      openInvoicesTotalCents: number
      billingHistory: DashboardInvoice[]
    }) => {
      const mapped = mapDashboardToState(row.user, row.insuranceData)
      setUser(mapped.user)
      setInsuranceData(mapped.insuranceData)
      setVehicles(row.vehicles)
      setShowDashboardCoverageSection(row.showDashboardCoverageSection)
      setBillingAddress(row.billingAddress)
      setActivePolicy(row.activePolicy)
      setActivePolicies(row.activePolicies)
      setTotalMonthlyPremiumCents(row.totalMonthlyPremiumCents)
      setOpenInvoice(row.openInvoice)
      setOpenInvoices(row.openInvoices)
      setOpenInvoicesTotalCents(row.openInvoicesTotalCents)
      setBillingHistory(row.billingHistory)
    },
    []
  )

  const clearDashboardState = useCallback(() => {
    setUser(null)
    setInsuranceData(null)
    setVehicles([])
    setShowDashboardCoverageSection(true)
    setBillingAddress(EMPTY_BILLING_ADDRESS)
    setActivePolicy(null)
    setActivePolicies([])
    setTotalMonthlyPremiumCents(0)
    setOpenInvoice(null)
    setOpenInvoices([])
    setOpenInvoicesTotalCents(0)
    setBillingHistory([])
  }, [])

  /** Skip duplicate dashboard fetch: login() already loaded; SIGNED_IN would refetch. */
  const skipNextSignedInFetch = useRef<string | null>(null)

  const hydrateFromSupabaseSession = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.user) {
      clearDashboardState()
      return
    }

    const row = await fetchDashboardForUser(supabase, session.user.id)
    if (row) {
      applyDashboardRow(row)
    } else {
      clearDashboardState()
    }
  }, [applyDashboardRow, clearDashboardState])

  const hydrateFromLocalDemo = useCallback(() => {
    const stored = localStorage.getItem('user')
    if (!stored) return

    const userData = JSON.parse(stored) as User
    setUser(userData)
    setShowDashboardCoverageSection(true)

    const storedInsurance = localStorage.getItem(`insurance_${userData.id}`)
    if (storedInsurance) {
      const ins = JSON.parse(storedInsurance) as Partial<InsuranceData>
      setInsuranceData({
        vehicleName: ins.vehicleName ?? '—',
        vin: ins.vin ?? '—',
        modelYear: ins.modelYear ?? '',
        vehicleMake: ins.vehicleMake ?? '',
        vehicleModel: ins.vehicleModel ?? '',
        trimLevel: ins.trimLevel ?? '',
        bodyClass: ins.bodyClass ?? '',
        coverage: (ins.coverage ?? {
          liability: false,
          collision: false,
          comprehensive: false,
          uninsuredMotorist: false,
          medicalPayments: false,
          roadsideAssistance: false,
        }) as CoverageOptions,
        premium: ins.premium ?? 0,
        policyNumber: ins.policyNumber ?? '—',
        policyEffectiveDate: ins.policyEffectiveDate ?? '—',
        policyExpirationDate: ins.policyExpirationDate ?? '—',
        policyAddress: ins.policyAddress ?? '—',
        insuranceCardPdfPath: ins.insuranceCardPdfPath,
      })
    }
  }, [])

  const refreshUserData = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      hydrateFromLocalDemo()
      return
    }
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user) {
      clearDashboardState()
      return
    }
    const row = await fetchDashboardForUser(supabase, session.user.id)
    if (row) {
      applyDashboardRow(row)
    } else {
      clearDashboardState()
    }
  }, [applyDashboardRow, clearDashboardState, hydrateFromLocalDemo])

  const updateUserProfile = useCallback(
    async (p: { name: string; phone: string }) => {
      if (isSupabaseConfigured()) {
        const supabase = getSupabaseBrowserClient()
        if (!supabase) {
          throw new Error('Not connected')
        }
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session?.user) {
          throw new Error('Not signed in')
        }
        const { error } = await supabase
          .from('profiles')
          .update({
            name: p.name,
            phone: p.phone,
          })
          .eq('id', session.user.id)
        if (error) {
          throw new Error(error.message)
        }
        await refreshUserData()
        return
      }
      setUser(prev => {
        if (!prev) return null
        const u = { ...prev, name: p.name, phone: p.phone }
        localStorage.setItem('user', JSON.stringify(u))
        return u
      })
    },
    [refreshUserData]
  )

  const updateVehicleDetails = useCallback(
    async (p: {
      vehicleName: string
      vin: string
      modelYear: string
      vehicleMake: string
      vehicleModel: string
      trimLevel: string
      bodyClass: string
    }) => {
      if (isSupabaseConfigured()) {
        const supabase = getSupabaseBrowserClient()
        if (!supabase) throw new Error('Not connected')
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session?.user) throw new Error('Not signed in')

        const { data: veh } = await supabase
          .from('vehicles')
          .select('id')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (!veh?.id) throw new Error('No vehicle on file')

        const { error } = await supabase
          .from('vehicles')
          .update({
            vehicle_name: p.vehicleName,
            vin: p.vin,
            model_year: p.modelYear,
            vehicle_make: p.vehicleMake,
            vehicle_model: p.vehicleModel,
            trim_level: p.trimLevel,
            body_class: p.bodyClass,
          })
          .eq('id', veh.id)

        if (error) throw new Error(error.message)
        await refreshUserData()
        return
      }

      setInsuranceData(prev => {
        if (!prev || !user) return prev
        const next: InsuranceData = {
          ...prev,
          vehicleName: p.vehicleName,
          vin: p.vin,
          modelYear: p.modelYear,
          vehicleMake: p.vehicleMake,
          vehicleModel: p.vehicleModel,
          trimLevel: p.trimLevel,
          bodyClass: p.bodyClass,
        }
        localStorage.setItem(`insurance_${user.id}`, JSON.stringify(next))
        return next
      })
    },
    [refreshUserData, user]
  )

  const updatePassword = useCallback(async (newPassword: string) => {
    if (!isSupabaseConfigured()) {
      throw new Error('Password can only be changed for accounts signed in with the online service.')
    }
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      throw new Error('Not connected')
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      throw new Error(error.message)
    }
  }, [])

  useEffect(() => {
    const storedClients = localStorage.getItem('clients')
    if (storedClients) {
      setClients(JSON.parse(storedClients) as ClientData[])
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      hydrateFromLocalDemo()
      setAuthReady(true)
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setAuthReady(true)
      return
    }

    let cancelled = false

    void (async () => {
      try {
        await hydrateFromSupabaseSession()
      } finally {
        if (!cancelled) setAuthReady(true)
      }
    })()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        if (!session?.user) {
          clearDashboardState()
          return
        }
        // Initial page load: hydrateFromSupabaseSession() already fetches. Without this,
        // Supabase v2 also emits INITIAL_SESSION here — a duplicate round-trip to Postgres.
        if (event === 'INITIAL_SESSION') {
          return
        }
        // Refreshed tokens do not change profile/vehicle data; skip 3x DB queries each refresh.
        if (event === 'TOKEN_REFRESHED') {
          return
        }
        if (event === 'SIGNED_IN' && skipNextSignedInFetch.current === session.user.id) {
          skipNextSignedInFetch.current = null
          return
        }
        // Defer async work: awaiting inside the handler can block Supabase’s internal lock
        // and make signInWithPassword + navigation feel stuck for seconds. See:
        // https://supabase.com/docs/reference/javascript/auth-onauthstatechange
        const userId = session.user.id
        setTimeout(() => {
          void (async () => {
            try {
              const row = await fetchDashboardForUser(supabase, userId)
              if (row) {
                applyDashboardRow(row)
              } else {
                clearDashboardState()
              }
            } catch {
              /* keep session on transient failure */
            }
          })()
        }, 0)
      }
    )

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [applyDashboardRow, clearDashboardState, hydrateFromLocalDemo, hydrateFromSupabaseSession])

  const login = async (email: string, password: string): Promise<boolean> => {
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return false

      const { data: signInData, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) return false

      const session = signInData.session
      if (!session?.user) return false

      skipNextSignedInFetch.current = session.user.id

      const row = await fetchDashboardForUser(supabase, session.user.id)
      if (!row) {
        skipNextSignedInFetch.current = null
        setShowDashboardCoverageSection(true)
        await supabase.auth.signOut({ scope: 'local' })
        return false
      }

      applyDashboardRow(row)
      return true
    }

    setShowDashboardCoverageSection(true)
    await new Promise(resolve => setTimeout(resolve, 500))

    const client = clients.find(c => c.email === email && c.password === password)

    if (client) {
      const userData: User = {
        id: client.id,
        email: client.email,
        name: client.name,
        phone: client.phone,
        memberSince: client.memberSince,
      }

      setUser(userData)
      localStorage.setItem('user', JSON.stringify(userData))

      const insurance: InsuranceData = {
        vehicleName: client.vehicleName,
        vin: client.vin,
        modelYear: '',
        vehicleMake: '',
        vehicleModel: '',
        trimLevel: '',
        bodyClass: '',
        coverage: client.coverage,
        premium: client.annualPremium,
        policyNumber: client.policyNumber,
        policyEffectiveDate: '—',
        policyExpirationDate: '—',
        policyAddress: '—',
      }

      setInsuranceData(insurance)
      localStorage.setItem(`insurance_${userData.id}`, JSON.stringify(insurance))
      return true
    }

    if (email === 'demo@example.com' && password === 'demo123') {
      const userData: User = {
        id: 'demo',
        email: 'demo@example.com',
        name: 'Jenny Martinez',
        phone: '(555) 123-4567',
        memberSince: 'Dec 2009',
      }

      setUser(userData)
      localStorage.setItem('user', JSON.stringify(userData))

      const mockInsurance: InsuranceData = {
        vehicleName: '2022 Honda Civic',
        vin: '1HGBH41JXMN109186',
        modelYear: '2022',
        vehicleMake: 'Honda',
        vehicleModel: 'Civic',
        trimLevel: '',
        bodyClass: '',
        coverage: {
          liability: true,
          collision: true,
          comprehensive: true,
          uninsuredMotorist: true,
          medicalPayments: true,
          roadsideAssistance: true,
        },
        premium: 436.0,
        policyNumber: 'ABP6300023856',
        policyEffectiveDate: 'Jan 1, 2024',
        policyExpirationDate: 'Dec 31, 2024',
        policyAddress: '123 Main St, Fort Lee, NJ 07024',
      }

      setInsuranceData(mockInsurance)
      localStorage.setItem(`insurance_${userData.id}`, JSON.stringify(mockInsurance))
      return true
    }

    return false
  }

  const signup = async (email: string, password: string, name: string) => {
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) throw new SignupError('unknown', 'Supabase client unavailable')

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
        },
      })

      if (error) {
        throw mapSupabaseSignupError(error)
      }

      // Supabase suppresses a real `error` when email-confirmation is on and the
      // address is already registered; the returned `user.identities` array is
      // empty in that case. Treat it as a duplicate so the UI can react.
      if (isObfuscatedDuplicateUser(data?.user as SupabaseUserWithIdentities | null)) {
        throw new SignupError(
          'email_taken',
          'An account with this email already exists.',
        )
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (session?.user) {
        const row = await fetchDashboardForUser(supabase, session.user.id)
        if (row) {
          applyDashboardRow(row)
        }
      }
      return
    }

    setShowDashboardCoverageSection(true)
    await new Promise(resolve => setTimeout(resolve, 500))

    // Demo-mode duplicate check: if a localStorage user with the same email is
    // already present, surface the same error so the UX matches Supabase mode.
    if (typeof window !== 'undefined') {
      try {
        const existing = window.localStorage.getItem('user')
        if (existing) {
          const parsed = JSON.parse(existing) as Partial<User>
          if (parsed?.email && parsed.email.toLowerCase() === email.toLowerCase()) {
            throw new SignupError(
              'email_taken',
              'An account with this email already exists.',
            )
          }
        }
      } catch (e) {
        if (e instanceof SignupError) throw e
        /* ignore malformed localStorage */
      }
    }

    const userData: User = {
      id: email.split('@')[0],
      email,
      name,
      phone: '(555) 000-0000',
      memberSince: new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
      }),
    }

    setUser(userData)
    localStorage.setItem('user', JSON.stringify(userData))

    const mockInsurance: InsuranceData = {
      vehicleName: '2023 Tesla Model 3',
      vin: '5YJ3E1EA1PF000001',
      modelYear: '',
      vehicleMake: '',
      vehicleModel: '',
      trimLevel: '',
      bodyClass: '',
      coverage: {
        liability: true,
        collision: true,
        comprehensive: true,
        uninsuredMotorist: false,
        medicalPayments: false,
        roadsideAssistance: false,
      },
      premium: 599.0,
      policyNumber: 'ABP6312345678',
      policyEffectiveDate: '—',
      policyExpirationDate: '—',
      policyAddress: '—',
    }

    setInsuranceData(mockInsurance)
    localStorage.setItem(`insurance_${userData.id}`, JSON.stringify(mockInsurance))
  }

  const logout = async () => {
    skipNextSignedInFetch.current = null

    if (isSupabaseConfigured()) {
      const supabase = getSupabaseBrowserClient()
      if (supabase) {
        // scope: 'global' revokes refresh token server-side; do not cut short or cookies may remain
        try {
          await supabase.auth.signOut({ scope: 'global' })
        } catch {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
        }
        try {
          if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_SUPABASE_URL) {
            const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]
            const prefix = `sb-${ref}-`
            for (const key of Object.keys(localStorage)) {
              if (key.startsWith(prefix)) {
                localStorage.removeItem(key)
              }
            }
          }
        } catch {
          /* ignore */
        }
      }
    }

    clearDashboardState()
    localStorage.removeItem('user')
  }

  const addClient = (client: ClientData) => {
    const updated = [...clients, client]
    setClients(updated)
    localStorage.setItem('clients', JSON.stringify(updated))
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        insuranceData,
        vehicles,
        showDashboardCoverageSection,
        billingAddress,
        activePolicy,
        activePolicies,
        totalMonthlyPremiumCents,
        openInvoice,
        openInvoices,
        openInvoicesTotalCents,
        billingHistory,
        login,
        signup,
        logout,
        refreshUserData,
        updateUserProfile,
        updateVehicleDetails,
        updatePassword,
        clients,
        addClient,
        authReady,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth () {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
