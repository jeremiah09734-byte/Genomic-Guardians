// GeneticDataStorage.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface GeneticRecord {
  owner: string;
  timestamp: number;
  dataType: string;
  description: string;
}

interface VersionRecord {
  updatedHash: Buffer;
  updateNotes: string;
  timestamp: number;
}

interface LicenseRecord {
  expiry: number;
  terms: string;
  active: boolean;
  accessLevel: string;
}

interface CategoryRecord {
  category: string;
  tags: string[];
}

interface CollaboratorRecord {
  role: string;
  permissions: string[];
  addedAt: number;
}

interface StatusRecord {
  status: string;
  visibility: boolean;
  lastUpdated: number;
}

interface RevenueShareRecord {
  percentage: number;
  totalReceived: number;
}

interface ContractState {
  geneticRegistry: Map<string, GeneticRecord>; // Key: hex string of buff32
  dataVersions: Map<string, VersionRecord>; // Key: `${originalHashHex}_${version}`
  dataLicenses: Map<string, LicenseRecord>; // Key: `${dataHashHex}_${licensee}`
  dataCategories: Map<string, CategoryRecord>; // Key: dataHashHex
  dataCollaborators: Map<string, CollaboratorRecord>; // Key: `${dataHashHex}_${collaborator}`
  dataStatus: Map<string, StatusRecord>; // Key: dataHashHex
  revenueShares: Map<string, RevenueShareRecord>; // Key: `${dataHashHex}_${participant}`
  contractPaused: boolean;
  contractAdmin: string;
  totalRegistrations: number;
  currentBlockHeight: number; // Mocked block-height
}

// Mock contract implementation
class GeneticDataStorageMock {
  private state: ContractState = {
    geneticRegistry: new Map(),
    dataVersions: new Map(),
    dataLicenses: new Map(),
    dataCategories: new Map(),
    dataCollaborators: new Map(),
    dataStatus: new Map(),
    revenueShares: new Map(),
    contractPaused: false,
    contractAdmin: "deployer",
    totalRegistrations: 0,
    currentBlockHeight: 1000,
  };

  private ERR_ALREADY_REGISTERED = 1;
  private ERR_NOT_OWNER = 2;
  private ERR_INVALID_HASH = 3;
  private ERR_INVALID_PARAM = 4;
  private ERR_NOT_AUTHORIZED = 5;
  private ERR_EXPIRED = 6;
  private ERR_INVALID_SHARE = 7;
  private ERR_MAX_TAGS_EXCEEDED = 8;
  private ERR_MAX_PERMS_EXCEEDED = 9;
  private ERR_PAUSED = 10;

  // Helper to mock buff32 as hex string
  private buffToHex(buff: Buffer): string {
    return buff.toString('hex');
  }

  // Helper to validate hash
  private validateHash(hash: Buffer): ClarityResponse<boolean> {
    return hash.length === 32 ? { ok: true, value: true } : { ok: false, value: this.ERR_INVALID_HASH };
  }

  // Helper to validate string len
  private validateStringLen(str: string, maxLen: number): ClarityResponse<boolean> {
    return str.length <= maxLen ? { ok: true, value: true } : { ok: false, value: this.ERR_INVALID_PARAM };
  }

  // Mock block-height
  private getBlockHeight(): number {
    return this.state.currentBlockHeight;
  }

  // Increment block height for testing
  incrementBlockHeight(amount: number): void {
    this.state.currentBlockHeight += amount;
  }

  registerGeneticData(
    caller: string,
    dataHash: Buffer,
    dataType: string,
    description: string
  ): ClarityResponse<boolean> {
    if (this.state.contractPaused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const hashHex = this.buffToHex(dataHash);
    const validateHashRes = this.validateHash(dataHash);
    if (!validateHashRes.ok) return validateHashRes;
    const validateType = this.validateStringLen(dataType, 50);
    if (!validateType.ok) return validateType;
    const validateDesc = this.validateStringLen(description, 500);
    if (!validateDesc.ok) return validateDesc;
    if (this.state.geneticRegistry.has(hashHex)) {
      return { ok: false, value: this.ERR_ALREADY_REGISTERED };
    }
    this.state.geneticRegistry.set(hashHex, {
      owner: caller,
      timestamp: this.getBlockHeight(),
      dataType,
      description,
    });
    this.state.totalRegistrations += 1;
    return { ok: true, value: true };
  }

  registerNewVersion(
    caller: string,
    originalHash: Buffer,
    newHash: Buffer,
    version: number,
    notes: string
  ): ClarityResponse<boolean> {
    if (this.state.contractPaused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const origHex = this.buffToHex(originalHash);
    const validateOrig = this.validateHash(originalHash);
    if (!validateOrig.ok) return validateOrig;
    const validateNew = this.validateHash(newHash);
    if (!validateNew.ok) return validateNew;
    const validateNotes = this.validateStringLen(notes, 200);
    if (!validateNotes.ok) return validateNotes;
    const entry = this.state.geneticRegistry.get(origHex);
    if (!entry || entry.owner !== caller) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    const key = `${origHex}_${version}`;
    this.state.dataVersions.set(key, {
      updatedHash: newHash,
      updateNotes: notes,
      timestamp: this.getBlockHeight(),
    });
    return { ok: true, value: true };
  }

  grantLicense(
    caller: string,
    dataHash: Buffer,
    licensee: string,
    duration: number,
    terms: string,
    accessLevel: string
  ): ClarityResponse<boolean> {
    if (this.state.contractPaused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const hashHex = this.buffToHex(dataHash);
    const validateHashRes = this.validateHash(dataHash);
    if (!validateHashRes.ok) return validateHashRes;
    const validateTerms = this.validateStringLen(terms, 200);
    if (!validateTerms.ok) return validateTerms;
    const validateAccess = this.validateStringLen(accessLevel, 20);
    if (!validateAccess.ok) return validateAccess;
    const entry = this.state.geneticRegistry.get(hashHex);
    if (!entry || entry.owner !== caller) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    const key = `${hashHex}_${licensee}`;
    this.state.dataLicenses.set(key, {
      expiry: this.getBlockHeight() + duration,
      terms,
      active: true,
      accessLevel,
    });
    return { ok: true, value: true };
  }

  revokeLicense(
    caller: string,
    dataHash: Buffer,
    licensee: string
  ): ClarityResponse<boolean> {
    if (this.state.contractPaused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const hashHex = this.buffToHex(dataHash);
    const validateHashRes = this.validateHash(dataHash);
    if (!validateHashRes.ok) return validateHashRes;
    const entry = this.state.geneticRegistry.get(hashHex);
    if (!entry || entry.owner !== caller) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    const key = `${hashHex}_${licensee}`;
    const license = this.state.dataLicenses.get(key);
    if (!license) {
      return { ok: false, value: this.ERR_INVALID_PARAM };
    }
    this.state.dataLicenses.set(key, { ...license, active: false });
    return { ok: true, value: true };
  }

  addCategory(
    caller: string,
    dataHash: Buffer,
    category: string,
    tags: string[]
  ): ClarityResponse<boolean> {
    if (this.state.contractPaused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const hashHex = this.buffToHex(dataHash);
    const validateHashRes = this.validateHash(dataHash);
    if (!validateHashRes.ok) return validateHashRes;
    const validateCat = this.validateStringLen(category, 50);
    if (!validateCat.ok) return validateCat;
    if (tags.length > 20) {
      return { ok: false, value: this.ERR_MAX_TAGS_EXCEEDED };
    }
    const entry = this.state.geneticRegistry.get(hashHex);
    if (!entry || entry.owner !== caller) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    this.state.dataCategories.set(hashHex, { category, tags });
    return { ok: true, value: true };
  }

  addCollaborator(
    caller: string,
    dataHash: Buffer,
    collaborator: string,
    role: string,
    permissions: string[]
  ): ClarityResponse<boolean> {
    if (this.state.contractPaused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const hashHex = this.buffToHex(dataHash);
    const validateHashRes = this.validateHash(dataHash);
    if (!validateHashRes.ok) return validateHashRes;
    const validateRole = this.validateStringLen(role, 50);
    if (!validateRole.ok) return validateRole;
    if (permissions.length > 10) {
      return { ok: false, value: this.ERR_MAX_PERMS_EXCEEDED };
    }
    const entry = this.state.geneticRegistry.get(hashHex);
    if (!entry || entry.owner !== caller) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    const key = `${hashHex}_${collaborator}`;
    this.state.dataCollaborators.set(key, {
      role,
      permissions,
      addedAt: this.getBlockHeight(),
    });
    return { ok: true, value: true };
  }

  updateStatus(
    caller: string,
    dataHash: Buffer,
    status: string,
    visibility: boolean
  ): ClarityResponse<boolean> {
    if (this.state.contractPaused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const hashHex = this.buffToHex(dataHash);
    const validateHashRes = this.validateHash(dataHash);
    if (!validateHashRes.ok) return validateHashRes;
    const validateStatus = this.validateStringLen(status, 20);
    if (!validateStatus.ok) return validateStatus;
    const entry = this.state.geneticRegistry.get(hashHex);
    if (!entry || entry.owner !== caller) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    this.state.dataStatus.set(hashHex, {
      status,
      visibility,
      lastUpdated: this.getBlockHeight(),
    });
    return { ok: true, value: true };
  }

  setRevenueShare(
    caller: string,
    dataHash: Buffer,
    participant: string,
    percentage: number
  ): ClarityResponse<boolean> {
    if (this.state.contractPaused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const hashHex = this.buffToHex(dataHash);
    const validateHashRes = this.validateHash(dataHash);
    if (!validateHashRes.ok) return validateHashRes;
    if (percentage > 100) {
      return { ok: false, value: this.ERR_INVALID_SHARE };
    }
    const entry = this.state.geneticRegistry.get(hashHex);
    if (!entry || entry.owner !== caller) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    const key = `${hashHex}_${participant}`;
    this.state.revenueShares.set(key, {
      percentage,
      totalReceived: 0,
    });
    return { ok: true, value: true };
  }

  pauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.contractAdmin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.contractPaused = true;
    return { ok: true, value: true };
  }

  unpauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.contractAdmin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.contractPaused = false;
    return { ok: true, value: true };
  }

  transferAdmin(caller: string, newAdmin: string): ClarityResponse<boolean> {
    if (caller !== this.state.contractAdmin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.contractAdmin = newAdmin;
    return { ok: true, value: true };
  }

  getGeneticData(dataHash: Buffer): ClarityResponse<GeneticRecord | null> {
    const hashHex = this.buffToHex(dataHash);
    return { ok: true, value: this.state.geneticRegistry.get(hashHex) ?? null };
  }

  getVersion(originalHash: Buffer, version: number): ClarityResponse<VersionRecord | null> {
    const origHex = this.buffToHex(originalHash);
    const key = `${origHex}_${version}`;
    return { ok: true, value: this.state.dataVersions.get(key) ?? null };
  }

  getLicense(dataHash: Buffer, licensee: string): ClarityResponse<LicenseRecord | null> {
    const hashHex = this.buffToHex(dataHash);
    const key = `${hashHex}_${licensee}`;
    const license = this.state.dataLicenses.get(key);
    if (license && license.active && license.expiry > this.getBlockHeight()) {
      return { ok: true, value: license };
    }
    return { ok: true, value: null };
  }

  getCategory(dataHash: Buffer): ClarityResponse<CategoryRecord | null> {
    const hashHex = this.buffToHex(dataHash);
    return { ok: true, value: this.state.dataCategories.get(hashHex) ?? null };
  }

  getCollaborator(dataHash: Buffer, collaborator: string): ClarityResponse<CollaboratorRecord | null> {
    const hashHex = this.buffToHex(dataHash);
    const key = `${hashHex}_${collaborator}`;
    return { ok: true, value: this.state.dataCollaborators.get(key) ?? null };
  }

  getStatus(dataHash: Buffer): ClarityResponse<StatusRecord | null> {
    const hashHex = this.buffToHex(dataHash);
    return { ok: true, value: this.state.dataStatus.get(hashHex) ?? null };
  }

  getRevenueShare(dataHash: Buffer, participant: string): ClarityResponse<RevenueShareRecord | null> {
    const hashHex = this.buffToHex(dataHash);
    const key = `${hashHex}_${participant}`;
    return { ok: true, value: this.state.revenueShares.get(key) ?? null };
  }

  isContractPaused(): ClarityResponse<boolean> {
    return { ok: true, value: this.state.contractPaused };
  }

  getTotalRegistrations(): ClarityResponse<number> {
    return { ok: true, value: this.state.totalRegistrations };
  }

  verifyOwnership(dataHash: Buffer, claimedOwner: string): ClarityResponse<boolean> {
    const hashHex = this.buffToHex(dataHash);
    const entry = this.state.geneticRegistry.get(hashHex);
    return { ok: true, value: !!entry && entry.owner === claimedOwner };
  }

  hasValidLicense(dataHash: Buffer, licensee: string): ClarityResponse<boolean> {
    const licenseRes = this.getLicense(dataHash, licensee);
    return { ok: true, value: !!licenseRes.value };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  owner: "wallet_1",
  licensee: "wallet_2",
  collaborator: "wallet_3",
  participant: "wallet_4",
};

// Helper to create mock buff32
const mockHash = (str: string): Buffer => Buffer.from(str.padEnd(32, '0'), 'utf8');

describe("GeneticDataStorage Contract", () => {
  let contract: GeneticDataStorageMock;

  beforeEach(() => {
    contract = new GeneticDataStorageMock();
    vi.resetAllMocks();
  });

  it("should register new genetic data", () => {
    const dataHash = mockHash("genetic1");
    const result = contract.registerGeneticData(accounts.owner, dataHash, "whole-genome", "User's full DNA sequence");
    expect(result).toEqual({ ok: true, value: true });

    const data = contract.getGeneticData(dataHash);
    expect(data).toEqual({
      ok: true,
      value: expect.objectContaining({
        owner: accounts.owner,
        dataType: "whole-genome",
        description: "User's full DNA sequence",
      }),
    });

    expect(contract.getTotalRegistrations()).toEqual({ ok: true, value: 1 });
  });

  it("should prevent duplicate registration", () => {
    const dataHash = mockHash("genetic2");
    contract.registerGeneticData(accounts.owner, dataHash, "exome", "Exome data");

    const duplicate = contract.registerGeneticData(accounts.owner, dataHash, "exome", "Duplicate");
    expect(duplicate).toEqual({ ok: false, value: 1 });
  });

  it("should register new version", () => {
    const origHash = mockHash("genetic3");
    contract.registerGeneticData(accounts.owner, origHash, "whole-genome", "Initial");

    const newHash = mockHash("genetic3_v2");
    const result = contract.registerNewVersion(accounts.owner, origHash, newHash, 1, "Updated with new analysis");
    expect(result).toEqual({ ok: true, value: true });

    const version = contract.getVersion(origHash, 1);
    expect(version).toEqual({
      ok: true,
      value: expect.objectContaining({
        updateNotes: "Updated with new analysis",
      }),
    });
  });

  it("should prevent non-owner from registering version", () => {
    const origHash = mockHash("genetic4");
    contract.registerGeneticData(accounts.owner, origHash, "whole-genome", "Initial");

    const newHash = mockHash("genetic4_v2");
    const result = contract.registerNewVersion(accounts.licensee, origHash, newHash, 1, "Unauthorized");
    expect(result).toEqual({ ok: false, value: 2 });
  });

  it("should grant and revoke license", () => {
    const dataHash = mockHash("genetic5");
    contract.registerGeneticData(accounts.owner, dataHash, "whole-genome", "Initial");

    const grant = contract.grantLicense(accounts.owner, dataHash, accounts.licensee, 1000, "Research use only", "read-only");
    expect(grant).toEqual({ ok: true, value: true });

    let license = contract.getLicense(dataHash, accounts.licensee);
    expect(license).toEqual({
      ok: true,
      value: expect.objectContaining({
        terms: "Research use only",
        active: true,
      }),
    });

    const revoke = contract.revokeLicense(accounts.owner, dataHash, accounts.licensee);
    expect(revoke).toEqual({ ok: true, value: true });

    license = contract.getLicense(dataHash, accounts.licensee);
    expect(license).toEqual({ ok: true, value: null });
  });

  it("should expire license after block height passes", () => {
    const dataHash = mockHash("genetic6");
    contract.registerGeneticData(accounts.owner, dataHash, "whole-genome", "Initial");

    contract.grantLicense(accounts.owner, dataHash, accounts.licensee, 100, "Short term", "read-only");

    let hasLicense = contract.hasValidLicense(dataHash, accounts.licensee);
    expect(hasLicense).toEqual({ ok: true, value: true });

    contract.incrementBlockHeight(101);

    hasLicense = contract.hasValidLicense(dataHash, accounts.licensee);
    expect(hasLicense).toEqual({ ok: true, value: false });
  });

  it("should add category and tags", () => {
    const dataHash = mockHash("genetic7");
    contract.registerGeneticData(accounts.owner, dataHash, "whole-genome", "Initial");

    const tags = ["health", "ancestry"];
    const result = contract.addCategory(accounts.owner, dataHash, "personal", tags);
    expect(result).toEqual({ ok: true, value: true });

    const category = contract.getCategory(dataHash);
    expect(category).toEqual({
      ok: true,
      value: { category: "personal", tags },
    });
  });

  it("should prevent exceeding max tags", () => {
    const dataHash = mockHash("genetic8");
    contract.registerGeneticData(accounts.owner, dataHash, "whole-genome", "Initial");

    const tooManyTags = Array(21).fill("tag");
    const result = contract.addCategory(accounts.owner, dataHash, "personal", tooManyTags);
    expect(result).toEqual({ ok: false, value: 8 });
  });

  it("should add collaborator", () => {
    const dataHash = mockHash("genetic9");
    contract.registerGeneticData(accounts.owner, dataHash, "whole-genome", "Initial");

    const permissions = ["view", "share"];
    const result = contract.addCollaborator(accounts.owner, dataHash, accounts.collaborator, "family", permissions);
    expect(result).toEqual({ ok: true, value: true });

    const collab = contract.getCollaborator(dataHash, accounts.collaborator);
    expect(collab).toEqual({
      ok: true,
      value: expect.objectContaining({
        role: "family",
        permissions,
      }),
    });
  });

  it("should prevent exceeding max permissions", () => {
    const dataHash = mockHash("genetic10");
    contract.registerGeneticData(accounts.owner, dataHash, "whole-genome", "Initial");

    const tooManyPerms = Array(11).fill("perm");
    const result = contract.addCollaborator(accounts.owner, dataHash, accounts.collaborator, "family", tooManyPerms);
    expect(result).toEqual({ ok: false, value: 9 });
  });

  it("should update status", () => {
    const dataHash = mockHash("genetic11");
    contract.registerGeneticData(accounts.owner, dataHash, "whole-genome", "Initial");

    const result = contract.updateStatus(accounts.owner, dataHash, "active", true);
    expect(result).toEqual({ ok: true, value: true });

    const status = contract.getStatus(dataHash);
    expect(status).toEqual({
      ok: true,
      value: expect.objectContaining({
        status: "active",
        visibility: true,
      }),
    });
  });

  it("should set revenue share", () => {
    const dataHash = mockHash("genetic12");
    contract.registerGeneticData(accounts.owner, dataHash, "whole-genome", "Initial");

    const result = contract.setRevenueShare(accounts.owner, dataHash, accounts.participant, 20);
    expect(result).toEqual({ ok: true, value: true });

    const share = contract.getRevenueShare(dataHash, accounts.participant);
    expect(share).toEqual({
      ok: true,
      value: { percentage: 20, totalReceived: 0 },
    });
  });

  it("should prevent invalid revenue share percentage", () => {
    const dataHash = mockHash("genetic13");
    contract.registerGeneticData(accounts.owner, dataHash, "whole-genome", "Initial");

    const result = contract.setRevenueShare(accounts.owner, dataHash, accounts.participant, 101);
    expect(result).toEqual({ ok: false, value: 7 });
  });

  it("should pause and unpause contract", () => {
    const pause = contract.pauseContract(accounts.deployer);
    expect(pause).toEqual({ ok: true, value: true });
    expect(contract.isContractPaused()).toEqual({ ok: true, value: true });

    const registerDuringPause = contract.registerGeneticData(accounts.owner, mockHash("paused"), "type", "desc");
    expect(registerDuringPause).toEqual({ ok: false, value: 10 });

    const unpause = contract.unpauseContract(accounts.deployer);
    expect(unpause).toEqual({ ok: true, value: true });
    expect(contract.isContractPaused()).toEqual({ ok: true, value: false });
  });

  it("should prevent non-admin from pausing", () => {
    const pause = contract.pauseContract(accounts.owner);
    expect(pause).toEqual({ ok: false, value: 5 });
  });

  it("should transfer admin", () => {
    const transfer = contract.transferAdmin(accounts.deployer, accounts.owner);
    expect(transfer).toEqual({ ok: true, value: true });

    const pauseByNewAdmin = contract.pauseContract(accounts.owner);
    expect(pauseByNewAdmin).toEqual({ ok: true, value: true });
  });

  it("should verify ownership", () => {
    const dataHash = mockHash("genetic14");
    contract.registerGeneticData(accounts.owner, dataHash, "whole-genome", "Initial");

    const verify = contract.verifyOwnership(dataHash, accounts.owner);
    expect(verify).toEqual({ ok: true, value: true });

    const wrong = contract.verifyOwnership(dataHash, accounts.licensee);
    expect(wrong).toEqual({ ok: true, value: false });
  });
});