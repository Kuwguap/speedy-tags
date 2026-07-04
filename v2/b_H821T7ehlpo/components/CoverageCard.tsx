interface CoverageOptions {
  liability: boolean
  collision: boolean
  comprehensive: boolean
  uninsuredMotorist: boolean
  medicalPayments: boolean
  roadsideAssistance: boolean
}

interface CoverageCardProps {
  coverage: CoverageOptions
}

export default function CoverageCard ({ coverage }: CoverageCardProps) {
  const coverageTypes = [
    { key: 'liability', name: 'Liability coverage', description: 'Damages you cause to others’ vehicles and property' },
    { key: 'collision', name: 'Collision coverage', description: 'Damage to your vehicle from collisions' },
    { key: 'comprehensive', name: 'Comprehensive coverage', description: 'Theft, weather, vandalism, and non-collision losses' },
    { key: 'uninsuredMotorist', name: 'Uninsured motorist', description: 'Protection when the other driver is uninsured or underinsured' },
    { key: 'medicalPayments', name: 'Medical payments', description: 'Medical expenses for you and your passengers' },
    { key: 'roadsideAssistance', name: 'Roadside assistance', description: 'Breakdowns, flats, lockouts, battery jumps, towing' },
  ]

  const activeCoverage = coverageTypes.filter(item => coverage[item.key as keyof CoverageOptions])
  const inactiveCoverage = coverageTypes.filter(item => !coverage[item.key as keyof CoverageOptions])

  return (
    <div className="surface-card p-6 md:p-10">
      <h2 className="text-2xl font-bold tracking-tight text-slate-900">Your coverage</h2>
      <p className="mt-2 text-slate-600">
        What&apos;s included on your policy today—contact us to make changes.
      </p>

      <div className="mt-8 mb-10">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Included
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          {activeCoverage.map(item => (
            <div
              key={item.key}
              className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-teal-50/80 p-4 ring-1 ring-emerald-600/10"
            >
              <div className="flex items-start gap-3">
                <svg className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <h4 className="font-semibold text-slate-900">{item.name}</h4>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {inactiveCoverage.length > 0 && (
        <div>
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Not included
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {inactiveCoverage.map(item => (
              <div key={item.key} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 opacity-90">
                <div className="flex items-start gap-3">
                  <svg className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div>
                    <h4 className="font-medium text-slate-700">{item.name}</h4>
                    <p className="mt-1 text-sm text-slate-500">{item.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-10 rounded-2xl border border-teal-200/80 bg-teal-50/80 p-5 ring-1 ring-teal-600/10">
        <p className="text-sm leading-relaxed text-teal-950">
          <span className="font-semibold">Need changes?</span> Reach out to your agent or customer
          service to update coverage—we&apos;re here to help.
        </p>
      </div>
    </div>
  )
}
