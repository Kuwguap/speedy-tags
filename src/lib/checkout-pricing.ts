/** US state codes treated as local (free driver delivery). */
export const DEFAULT_DRIVER_LOCAL_STATES = ["NJ"];

export function normalizeProductChoice(
  choice: string | undefined | null,
): "tag_only" | "insurance_only" | "tag_and_insurance" {
  const c = String(choice || "").trim();
  if (c === "insurance_only") return "insurance_only";
  if (c === "tag_and_insurance" || c === "insurance_monthly" || c === "insurance_yearly") {
    return "tag_and_insurance";
  }
  return "tag_only";
}

/** Extract a 2-letter US state code from a free-form address string. */
export function extractStateCode(address: string): string | null {
  const raw = String(address || "").trim();
  if (!raw) return null;

  // "City, NJ 07001" or "City, NJ"
  const commaMatch = raw.match(/,\s*([A-Za-z]{2})\b(?:\s+\d{5})?/);
  if (commaMatch) return commaMatch[1].toUpperCase();

  // "NJ 07001" or trailing " NJ"
  const zipMatch = raw.match(/\b([A-Za-z]{2})\s+\d{5}(?:-\d{4})?\b/);
  if (zipMatch) return zipMatch[1].toUpperCase();

  const tailMatch = raw.match(/\b([A-Za-z]{2})\s*$/);
  if (tailMatch) return tailMatch[1].toUpperCase();

  return null;
}

export function parseDriverLocalStates(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s || "").trim().toUpperCase()).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  }
  return [...DEFAULT_DRIVER_LOCAL_STATES];
}

export function isExtendedDriverState(
  address: string,
  localStates: string[] = DEFAULT_DRIVER_LOCAL_STATES,
): boolean {
  const code = extractStateCode(address);
  if (!code) return false;
  const locals = localStates.length > 0 ? localStates : DEFAULT_DRIVER_LOCAL_STATES;
  return !locals.map((s) => s.toUpperCase()).includes(code);
}

export interface CheckoutPricingConfig {
  plateOnlyPrice: number;
  insuranceOnlyPrice: number;
  plateAndInsurancePrice: number;
  overnightFedexFee: number;
  driverExtendedFee: number;
  driverLocalStates: string[];
  /** When set (e.g. from admin Services catalog), overrides product-choice pricing. */
  servicePrice?: number | null;
}

export function getProductPrice(
  productChoice: string,
  config: Pick<
    CheckoutPricingConfig,
    "plateOnlyPrice" | "insuranceOnlyPrice" | "plateAndInsurancePrice" | "servicePrice"
  >,
): number {
  if (
    config.servicePrice != null &&
    Number.isFinite(config.servicePrice) &&
    config.servicePrice >= 0
  ) {
    return config.servicePrice;
  }
  const choice = normalizeProductChoice(productChoice);
  if (choice === "insurance_only") return config.insuranceOnlyPrice;
  if (choice === "tag_and_insurance") return config.plateAndInsurancePrice;
  return config.plateOnlyPrice;
}

export function computeCheckoutTotal(
  productChoice: string,
  deliveryMethod: string,
  deliveryAddress: string,
  config: CheckoutPricingConfig,
): number {
  let total = getProductPrice(productChoice, config);
  if (deliveryMethod === "overnight_fedex") {
    total += config.overnightFedexFee;
  }
  if (
    deliveryMethod === "driver" &&
    isExtendedDriverState(deliveryAddress, config.driverLocalStates)
  ) {
    total += config.driverExtendedFee;
  }
  return total;
}

export function deliveryMethodLabel(method: string | undefined | null): string {
  switch (method) {
    case "mail":
      return "Mail (3-day priority)";
    case "driver":
      return "Driver Delivery";
    case "overnight_fedex":
      return "FedEx Overnight";
    case "email":
    default:
      return "Email Delivery";
  }
}

export function productChoiceLabel(choice: string | undefined | null): string {
  switch (normalizeProductChoice(choice)) {
    case "insurance_only":
      return "Insurance Only";
    case "tag_and_insurance":
      return "Plate + Insurance";
    default:
      return "Plate Only";
  }
}
