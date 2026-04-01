import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { randomBytes } from "node:crypto";

export interface BankEntry {
  code:        string;
  name:        string;
  shortName:   string;
  swift:       string;
  country:     "NG" | "GH";
  tier:        1 | 2 | 3;
  cbsVendor:   string;
  cbsApiPath:  string; // stub endpoint path; wired to real CBS in production
}

/** National Bank Directory — CBN + BoG licensed institutions. */
const BANK_DIRECTORY: BankEntry[] = [
  { code: "011151012", name: "First Bank of Nigeria PLC",     shortName: "FirstBank",   swift: "FBNINGLA", country: "NG", tier: 1, cbsVendor: "Finacle",     cbsApiPath: "/cbs/firstbank/v2/account/create" },
  { code: "058063220", name: "Guaranty Trust Bank PLC",       shortName: "GTBank",      swift: "GTBINGLA", country: "NG", tier: 1, cbsVendor: "Finacle",     cbsApiPath: "/cbs/gtbank/v2/account/create"    },
  { code: "044150149", name: "Access Bank PLC",               shortName: "Access",      swift: "ABNGNGLA", country: "NG", tier: 1, cbsVendor: "Flexcube",    cbsApiPath: "/cbs/access/v2/account/create"    },
  { code: "057080004", name: "Zenith Bank PLC",               shortName: "Zenith",      swift: "ZEIBNGLA", country: "NG", tier: 1, cbsVendor: "Finacle",     cbsApiPath: "/cbs/zenith/v2/account/create"    },
  { code: "070080003", name: "Fidelity Bank PLC",             shortName: "Fidelity",    swift: "FIDTNGLA", country: "NG", tier: 2, cbsVendor: "Flexcube",    cbsApiPath: "/cbs/fidelity/v2/account/create"  },
  { code: "076080045", name: "Polaris Bank Limited",          shortName: "Polaris",     swift: "PLRISNGLA",country: "NG", tier: 2, cbsVendor: "T24",         cbsApiPath: "/cbs/polaris/v2/account/create"   },
  { code: "032080474", name: "Union Bank of Nigeria PLC",     shortName: "UnionBank",   swift: "UBNINGLA", country: "NG", tier: 2, cbsVendor: "Finacle",     cbsApiPath: "/cbs/unionbank/v2/account/create" },
  { code: "221150075", name: "Stanbic IBTC Bank Nigeria",     shortName: "StanbicIBTC", swift: "SBICNGLA", country: "NG", tier: 1, cbsVendor: "T24",         cbsApiPath: "/cbs/stanbic/v2/account/create"   },
  { code: "030080009", name: "Heritage Bank Plc",             shortName: "Heritage",    swift: "HBBLNGLA", country: "NG", tier: 3, cbsVendor: "Flexcube",    cbsApiPath: "/cbs/heritage/v2/account/create"  },
  { code: "999001",    name: "Ecobank Ghana Limited",         shortName: "Ecobank-GH",  swift: "ECOCGHAC", country: "GH", tier: 1, cbsVendor: "Flexcube",    cbsApiPath: "/cbs/ecobank-gh/v2/account/create"},
  { code: "999002",    name: "Ghana Commercial Bank Limited", shortName: "GCB",         swift: "GHCBGHAC", country: "GH", tier: 1, cbsVendor: "Finacle",     cbsApiPath: "/cbs/gcb/v2/account/create"       },
  { code: "999003",    name: "Absa Bank Ghana Limited",       shortName: "Absa-GH",     swift: "BARCGHAC", country: "GH", tier: 1, cbsVendor: "T24",         cbsApiPath: "/cbs/absa-gh/v2/account/create"   },
];

/** Generate a NUBAN-compliant 10-digit account number (stub — real NUBAN uses CBN algorithm). */
function generateNuban(bankCode: string): string {
  const serial   = randomBytes(4).readUInt32BE(0) % 999999999;
  const raw      = `${bankCode.slice(-3)}${serial.toString().padStart(9, "0")}`;
  return raw.slice(0, 10);
}

@Injectable()
export class BankDirectoryService {
  private readonly log = new Logger(BankDirectoryService.name);

  listBanks(): Omit<BankEntry, "cbsApiPath">[] {
    return BANK_DIRECTORY.map(({ cbsApiPath: _, ...rest }) => rest);
  }

  findByCode(code: string): BankEntry {
    const bank = BANK_DIRECTORY.find(b => b.code === code);
    if (!bank) throw new BadRequestException(`Bank code ${code} not found in National Bank Directory`);
    return bank;
  }

  /**
   * CBS Push — relay identity package to the bank's Core Banking System.
   *
   * In production:
   *   - Decrypted shadow profile is posted (mTLS) to the bank's CBS API endpoint.
   *   - The bank's CBS validates against its own NIBSS mirror, creates the account, and returns NUBAN.
   *   - This call must complete within the 60-second mandate window.
   *
   * Stub implementation: generates a valid NUBAN and returns a simulated CBS response.
   */
  async pushToCbs(
    bank: BankEntry,
    identityPayload: {
      firstName: string; lastName: string; middleName: string;
      dateOfBirth: string; gender: string; address: string;
      stateOfOrigin: string; nibssTokenId: string;
    },
    accountType: string,
  ): Promise<{ accountNumber: string; bankApiResponse: string; elapsedMs: number }> {
    const startMs = Date.now();

    // Stub: simulate CBS network latency (120–800ms)
    await new Promise(r => setTimeout(r, 120 + Math.random() * 680));

    const accountNumber = generateNuban(bank.code);
    const elapsedMs     = Date.now() - startMs;

    const bankApiResponse = JSON.stringify({
      status:        "SUCCESS",
      bankCode:      bank.code,
      bankName:      bank.shortName,
      accountNumber,
      accountType,
      customerName:  `${identityPayload.lastName} ${identityPayload.firstName} ${identityPayload.middleName}`.trim(),
      nibssTokenId:  identityPayload.nibssTokenId,
      cbsRef:        `CBS-${Date.now()}`,
      provisionedAt: new Date().toISOString(),
      elapsedMs,
    });

    this.log.log(`[ZFOE][CBS] bank=${bank.shortName} account=${accountNumber} elapsedMs=${elapsedMs}`);
    return { accountNumber, bankApiResponse, elapsedMs };
  }

  /** SMS/Push confirmation stub — wires to USSD gateway or FCM in production. */
  sendConfirmation(msisdnHash: string, accountNumber: string, bankName: string, sessionRef: string): void {
    this.log.log(`[ZFOE][SMS-stub] New account ${accountNumber} at ${bankName} — msisdnHash=...${msisdnHash.slice(-8)} session=${sessionRef}`);
    // TODO: POST to SMS gateway (e.g., Termii, Africa's Talking) with account number and bank name
  }
}

