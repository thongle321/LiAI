/** Secret key builders for SecureStore (pure, tested).
 *
 * Key material (provider apiKeys, HF token) lives in SecureStore;
 * metadata stays in AsyncStorage. Keys are namespaced per provider id.
 */

export const HF_TOKEN_SS_KEY = "liai_hf_token";

export function providerKeySS(providerId: string): string {
  return `liai_provider_key_${providerId}`;
}
