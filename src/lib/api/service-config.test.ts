import { describe, expect, it } from "vitest";
import { serviceKeysFromEnv } from "./service-config";
describe("service key config", () => {
  it("accepts only valid secret-store entries", () => {
    expect(serviceKeysFromEnv('[{"keyId":"meiga-1","tenantCode":"MEIGA","secret":"1234567890123456"}]')).toHaveLength(1);
    expect(serviceKeysFromEnv("broken")).toEqual([]);
    expect(serviceKeysFromEnv('[{"keyId":"x","secret":"short"}]')).toEqual([]);
  });
});
