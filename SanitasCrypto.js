import forge from 'node-forge';
import CryptoJS from 'crypto-js';

// Clé publique RSA de Sanitas (extraite de BuildConfig.java)
const RSA_PUBLIC_KEY_STRING = `
-----BEGIN PUBLIC KEY-----
MIICITANBgkqhkiG9w0BAQEFAAOCAg4AMIICCQKCAgByftMTABwxElbrP/T7aM2U
0TFQsDbrGe25eY8IC08sAY4JE1WHxbR/IJZZjpydp2Xxc2lOGmWvOIv8CrexYN1s
hRE8vQ7rvBiK5ulXhNHiQS/pAkApQbHHDh3t5B2xmIzVZ0nGx7eegU1Km8i6Fvn6
k57D2Dp3QN34516QDz2h1EvRCMXCtH0nxTSyKdrmoFhbfxYSUHzui+l9i+1lx1A8
efirbpyeXpBsEBsiQb6AWIOZ+IxIJCkfB7u5oM1m9KB7Ph7hf/LgH4vT+L0rK1J0
dm9X4qbLHlTuvR4Om6ywTIqpR/kLqOKSqx9gIkV4hVuRdKYUgFcYGiM12zXDT6i7
tJzTnb4knyVCycpcBTlc+OIFRmw0L96Nu6fz7xj1rqFtvQPqBxmgaqZQ8QIuAuXo
7AszwpQFARvXNGYi5uyH9bsL8QO2/wPA0JlyTi4ei4EkGK477tkGtvGrOmaEOEdg
RVKi7ERS7JxtMOH00W+9IlbsmhylFyDvUyz0zcaG2MpFaPQAsg6td2ym2oaNJov7
GRLUhYS+YWQgxYYM2B5ahu1q6EM02tjxDJrz60IC0ffiACVasokHLXYD13RL0p3S
LTFxX9hECG1XU6wgC2chDYXSRb5SapWllm1zl8BfEiCgIP3i/Axn3s8GUNFNfNZV
E+aSUgJ8mHTSdMlTE7xJKQIDAQAB
-----END PUBLIC KEY-----
`;

// Porte la logique de 'evpKDF' (EVP_BytesToKey) du Java/Python
// CryptoJS implémente cela nativement.
function evpKDF(passwordBytes, saltBytes) {
  // Le Java utilise 1 itération de MD5 (comportement par défaut d'OpenSSL)
  const keySizeBits = 256;
  const ivSizeBits = 128;
  const derivedKey = CryptoJS.kdf.OpenSSL.execute(
    passwordBytes,
    keySizeBits / 32, // key size en mots de 32 bits
    ivSizeBits / 32, // iv size en mots de 32 bits
    saltBytes,
    CryptoJS.algo.MD5, // Utilise MD5 comme spécifié dans le Java
  );
  return {
    key: derivedKey.key,
    iv: derivedKey.iv,
  };
}

class SanitasCrypto {
  constructor() {
    console.log('[Crypto] Initialisation de SanitasCrypto...');
    // Génère la clé AES (chaîne hex de 65 chars)
    // C'est une simulation de la méthode Java, qui n'est pas un UUID standard
    const hexChars = '0123456789abcdef';
    let aesKeyHex = '';
    for (let i = 0; i < 65; i++) {
      aesKeyHex += hexChars.charAt(Math.floor(Math.random() * hexChars.length));
    }

    this.aesKeyHex = aesKeyHex;
    this.aesKeyBytes = CryptoJS.enc.Utf8.parse(aesKeyHex);

    // Charge la clé publique RSA
    try {
      const publicKey = forge.pki.publicKeyFromPem(RSA_PUBLIC_KEY_STRING);
      this.rsaPublicKey = publicKey;
      console.log('[Crypto] Clé publique RSA chargée.');
    } catch (e) {
      console.error('[Crypto] Erreur chargement clé RSA:', e);
    }
  }

  // Chiffre la clé AES avec la clé publique RSA
  rsaEncrypt(aesKeyString) {
    try {
      console.log('[Crypto] Chiffrement de la clé AES avec RSA...');
      // Le Java utilise "RSA/ECB/PKCS1Padding"
      const encrypted = this.rsaPublicKey.encrypt(
        aesKeyString,
        // 'RSA-PKCS1-V1_5',
      );
      // Le Java encode le résultat en Base64
      return forge.util.encode64(encrypted);
    } catch (e) {
      console.error('[Crypto] Erreur rsaEncrypt:', e);
      return null;
    }
  }

  // Chiffre le payload JSON (en clair)
  encryptPayload(plainText) {
    try {
      console.log('[Crypto] Chiffrement du payload JSON avec AES (Salted)...');
      // Crée un salt aléatoire de 8 octets
      const salt = CryptoJS.lib.WordArray.random(8);

      // Dérive la clé et l'IV à partir de la clé AES et du salt
      const { key, iv } = evpKDF(this.aesKeyBytes, salt);

      // Chiffre le payload
      const encrypted = CryptoJS.AES.encrypt(plainText, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7, // PKCS7 est compatible avec PKCS5
      });

      // Concatène "Salted__" + salt + données chiffrées
      // Le préfixe "Salted__"
      const saltedPrefix = CryptoJS.enc.Utf8.parse('Salted__');
      const saltedData = saltedPrefix.concat(salt).concat(encrypted.ciphertext);

      // Encode en Base64
      return CryptoJS.enc.Base64.stringify(saltedData);
    } catch (e) {
      console.error('[Crypto] Erreur encryptPayload:', e);
      return null;
    }
  }

  // Construit le corps de la requête chiffrée final
  getEncryptedRequest(dataString) {
    console.log('[Crypto] Construction du payload final chiffré...');
    const encryptedData = this.encryptPayload(dataString);
    const encryptedAesKey = this.rsaEncrypt(this.aesKeyHex);

    if (!encryptedData || !encryptedAesKey) {
      throw new Error('Échec du chiffrement du payload ou de la clé.');
    }

    const finalPayload = {
      data: encryptedData,
      key: encryptedAesKey,
      VersionNumber: 190, // Valeur fixe (comme dans le code Java)
      SourcePlatform: 'Android',
    };
    return JSON.stringify(finalPayload);
  }

  // Déchiffre la réponse du serveur
  decryptResponse(responseText) {
    console.log('[Crypto] Déchiffrement de la réponse du serveur...');
    try {
      // Décode de Base64
      const decodedBytes = CryptoJS.enc.Base64.parse(responseText);
      const decodedString = decodedBytes.toString(CryptoJS.enc.Hex);

      // Extrait le salt (après "Salted__" qui fait 8 octets/16 chars hex)
      const saltHex = decodedString.substring(16, 32); // 8 octets = 16 chars hex
      const salt = CryptoJS.enc.Hex.parse(saltHex);

      // Extrait le texte chiffré
      const ciphertextHex = decodedString.substring(32);
      const ciphertext = CryptoJS.enc.Hex.parse(ciphertextHex);

      // Dérive la MÊME clé et IV
      const { key, iv } = evpKDF(this.aesKeyBytes, salt);

      // Déchiffre
      const decrypted = CryptoJS.AES.decrypt({ ciphertext: ciphertext }, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (e) {
      console.error(`[Crypto ERREUR] Échec du déchiffrement : ${e}`);
      console.error(
        `[Crypto ERREUR] Réponse brute (tronquée) : ${responseText.substring(
          0,
          50,
        )}...`,
      );
      return JSON.stringify({ erreur_dechiffrement: e.message });
    }
  }
}

export default SanitasCrypto;
