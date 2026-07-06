/**
 * @speedy/shared — barrel export.
 * Server/bot code should prefer the subpath exports (./pdf, ./supabase, …)
 * so a browser bundle never accidentally pulls in service-role Supabase or
 * SendGrid. This barrel is for Node contexts (the bots).
 */

export {
  generateDocumentsForOrder,
  buildNjTempTagPdf,
  generatePlateNumber,
  generateCarNumber,
} from "./pdf/generate.js";

export {
  getServiceClient,
  getAnonClient,
  uploadBytes,
  signedUrl,
  BUCKETS,
} from "./supabase.js";

export { sendEmail } from "./mailer.js";

export {
  parseTagInfoText,
  parseTagInfoDocument,
  openAiEnabled,
} from "./openai.js";

export {
  allocateNextPlate,
  makeAllocator,
  formatNjPlate,
  formatNonNjPlate,
  loadSettings,
} from "./plates.js";

export { getStateInfo, SUPPORTED_STATES } from "./pdf/state-info.js";
