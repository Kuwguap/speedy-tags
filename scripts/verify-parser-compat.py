"""Verify buildKrableadsLeadMessage output parses in krableadsV2."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KRABLEADS = Path(__file__).resolve().parents[2] / "unity" / "krableadsV2"
if not KRABLEADS.exists():
    KRABLEADS = Path(r"c:\Users\tatia\Downloads\unity\krableadsV2")

sys.path.insert(0, str(KRABLEADS))
from utils.external_lead_parser import parse_external_lead_message  # noqa: E402

js = subprocess.run(
    [
        "node",
        "-e",
        """
import { buildKrableadsLeadMessage } from './server/krableads-ingest.js';
const msg = buildKrableadsLeadMessage({
  id: 'bf6923ca-1234-5678-abcd-ef0123456789',
  firstName: 'Zebin', lastName: 'Fang Fang', phone: '+1 (213) 862-2301',
  deliveryEmail: 'zebinfang1002@gmail.com', deliveryMethod: 'email',
  address: '28 brookside rd quincy MA 02169',
  deliveryAddress: '28 brookside rd quincy MA 02169',
  vin: 'SCA665C56HUX86704', year: '2017', make: 'ROLLS-ROYCE', model: 'Wraith', color: 'black',
  insuranceCompany: 'AC Insurance', policyNumber: '279-06071-913',
  serviceTitle: '30-Day NJ Temp Tag', price: 150,
});
process.stdout.write(msg);
""",
    ],
    cwd=ROOT,
    capture_output=True,
    text=True,
    encoding="utf-8",
    check=True,
)
msg = js.stdout
state, errors = parse_external_lead_message(msg)
print("--- message ---")
print(msg)
print("--- parser ---")
print("errors:", errors)
if state:
    print("name:", state.get("name"))
    print("price:", state.get("price"))
    print("external_order_id:", state.get("external_order_id"))
    print("phone:", state.get("phone"))
    print("vin:", state.get("vin"))
if errors:
    sys.exit(1)
print("OK: message parses cleanly")
