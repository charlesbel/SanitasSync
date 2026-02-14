# SanitasSync

> Reverse-engineered synchronization solution between Sanitas Connect smart scales and Samsung Health via Google Health Connect

[![React Native](https://img.shields.io/badge/React%20Native-0.82.1-blue.svg)](https://reactnative.dev/)
[![Platform](https://img.shields.io/badge/platform-Android%20Only-brightgreen.svg)](https://www.android.com/)

## Overview

**SanitasSync** is a React Native Android application that bridges the gap between Sanitas Connect smart scales and Samsung Health. Through **extensive reverse engineering** of the official Sanitas Android app, this project replicates the authentication and synchronization protocols to fetch health measurements from Sanitas servers and write them to Google Health Connect.

⚠️ **This is an unofficial reverse-engineered implementation.** There is no official API documentation from Sanitas. All protocol details were obtained through binary analysis and network traffic inspection.

⚠️ **This is a vide-coded app.** I theorically reviewed everything necessary but the repository might contains errors, as well as this AI generated README, please open an issue or a pull request if necessary.

### Key Features

- **Automated Background Synchronization**: Periodic syncing using Android's WorkManager (approximately every 15-30 minutes)
- **Reverse-Engineered Encryption**: Implements RSA-2048 + AES-256 encryption protocol extracted from the official app
- **Comprehensive Health Metrics**: Supports weight, body fat percentage, bone mass, lean body mass, and body water mass
- **Incremental Sync**: Only downloads and writes new measurements to avoid duplicates
- **Battery Efficient**: Uses Android's native background scheduling mechanisms
- **User-Friendly Interface**: Clean Material Design 3 UI built with React Native Paper

## Why Android Only?

This application is **Android-exclusive** by design because:

- Google Health Connect is only available on Android
- Samsung Health integration requires Health Connect as intermediary
- The reverse engineering was performed on the Android version of the Sanitas app

There are no plans for iOS support as Apple HealthKit would require a completely different implementation approach.

## Table of Contents

- [Reverse Engineering Process](#reverse-engineering-process)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Usage](#usage)
- [Technical Details](#technical-details)
- [Project Structure](#project-structure)
- [Permissions](#permissions)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [Legal](#legal)
- [Contributing](#contributing)

## Reverse Engineering Process

This project is the result of reverse engineering the official Sanitas Connect Android application (version 1.90). The following tools and techniques were used:

### Tools Used

- **[JADX](https://github.com/skylot/jadx)**: Decompilation of the Sanitas APK to analyze Java source code
- **[Burp Suite](https://portswigger.net/burp)**: Interception and analysis of HTTPS traffic between the app and Sanitas servers
- **[Android Debug Bridge (ADB)](https://developer.android.com/studio/command-line/adb)**: Runtime analysis and logging
- **[Frida](https://frida.re/)**: Dynamic instrumentation for studying cryptographic implementations
- **Certificate Pinning Bypass**: SSL unpinning to inspect encrypted communications

### Key Discoveries

Through reverse engineering, the following were extracted:

1. **RSA Public Key**: Hardcoded 2048-bit public key in `BuildConfig.java`
2. **Encryption Protocol**: Custom hybrid RSA/AES encryption scheme
3. **API Endpoints**: Authentication and data synchronization URLs
4. **Request Structure**: Complete payload format including device fingerprinting
5. **Authentication Flow**: Token-based authentication with device registration
6. **Data Models**: JSON structure for scale measurements and user data

### Decompilation Insights

The Sanitas app's cryptographic implementation (`SanitasCrypto.java`) revealed:

- Use of standard Java Cipher API with RSA/ECB/PKCS1Padding
- AES-256-CBC with OpenSSL-compatible salted key derivation
- Custom 65-character hexadecimal AES key generation
- Base64 encoding of encrypted payloads

Network traffic analysis with Burp Suite showed:

- All requests/responses are encrypted end-to-end
- Authorization header format: `Android#{FinalIdentifier}#{UserAccessToken}`
- Device fingerprinting includes manufacturer, model, OS version, and locale

## Prerequisites

### System Requirements

- **Android 9.0 (API 28)** or higher
- **Google Health Connect** installed and configured
- **Samsung Health** (optional, but recommended for visualization)
- **Node.js** 20 or higher
- **React Native CLI** development environment
- **Sanitas Connect** account with compatible smart scale (SBF 75, SBF 70, etc.)

### Compatible Devices

- Any Android smartphone running Android 9+ with Google Health Connect support
- Tested on Samsung Galaxy devices with One UI

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/charlesbel/SanitasSync.git
cd SanitasSync
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build and Run

```bash
# Start Metro bundler
npm start

# In another terminal, run Android
npm run android
```

### 4. Install Google Health Connect

If not already installed, download [Google Health Connect](https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata) from the Play Store.

## Architecture

### High-Level Overview

```
┌─────────────────┐
│  SanitasSync    │
│  (React Native) │
└────────┬────────┘
         │
         ├─── Sanitas Cloud ───► Authentication & Data Fetch
         │    (Encrypted API)     [Reverse Engineered]
         │
         └─── Health Connect ──► Write Health Records
              (Local Android Service)
                   │
                   └─── Samsung Health
                        (Reads from Health Connect)
```

### Core Components

1. **App.js** (13.5 KB): Main application UI with configuration, sync controls, and status display
2. **SanitasSyncLogic.js** (9.9 KB): Synchronization orchestration, authentication, and Health Connect integration
3. **SanitasCrypto.js** (6 KB): Replication of Sanitas encryption protocol

### Data Flow

```
User Credentials → Authentication (POST /auth/login/)
                          ↓
                   Session Token + FinalIdentifier
                          ↓
            Download Encrypted Data (POST /synchronization/downloadData/)
                          ↓
                 Decrypt Response (AES-256-CBC)
                          ↓
               Filter New Measurements (by timestamp)
                          ↓
         Check Health Connect for Existing Records
                          ↓
          Transform to Health Connect Record Format
                          ↓
               Write to Health Connect (insertRecords)
                          ↓
             Update Last Sync Timestamp (AsyncStorage)
```

## Configuration

### 1. Sanitas Credentials

On first launch, enter your Sanitas Connect credentials:

- **Email**: Your Sanitas account email
- **Password**: Your Sanitas account password

The application generates a unique UUID v4 Device ID automatically and stores it in AsyncStorage.

### 2. Health Connect Permissions

Grant the following permissions when prompted:

- Read/Write **Weight**
- Read/Write **Body Fat Percentage**
- Read/Write **Bone Mass**
- Read/Write **Lean Body Mass**
- Read/Write **Body Water Mass**

### 3. Battery Optimization

To ensure background synchronization works reliably:

1. Open the app
2. Navigate to **Optimisations** section
3. Click **Désactiver optimisation batterie**
4. Find SanitasSync and select "Don't optimize"

This prevents aggressive battery management from killing background tasks.

## Usage

### Manual Synchronization

1. Open the SanitasSync app
2. Ensure credentials are configured and saved
3. Navigate to **Actions manuelles** section
4. Tap **Synchroniser maintenant**
5. Status message updates at the top of the screen

### Automatic Synchronization

1. Configure and save your Sanitas credentials
2. Navigate to **Tâche d'arrière-plan** section
3. Toggle **Activer le service** to ON
4. The app now syncs automatically in the background

Android's WorkManager handles the scheduling. Actual sync frequency depends on device battery level and system constraints (typically 15-30 minutes).

### Viewing Your Data

After synchronization:

1. Open **Samsung Health**
2. Navigate to **Body Composition** → **Weight**
3. Your Sanitas measurements appear with original timestamps

## Technical Details

### Cryptography Implementation

The reverse-engineered Sanitas protocol uses a hybrid encryption scheme:

#### Request Encryption (Based on Decompiled Java Code)

```javascript
// 1. Generate random 65-char hex AES key
const hexChars = '0123456789abcdef';
let aesKeyHex = '';
for (let i = 0; i < 65; i++) {
  aesKeyHex += hexChars.charAt(Math.floor(Math.random() * hexChars.length));
}

// 2. Encrypt AES key with RSA-2048 public key (PKCS1 padding)
const encryptedKey = rsaPublicKey.encrypt(aesKeyHex);

// 3. Generate random 8-byte salt
const salt = CryptoJS.lib.WordArray.random(8);

// 4. Derive key/IV using OpenSSL EVP_BytesToKey (MD5, 1 iteration)
const { key, iv } = evpKDF(aesKeyBytes, salt);

// 5. Encrypt JSON with AES-256-CBC (PKCS7 padding)
const encrypted = CryptoJS.AES.encrypt(plainText, key, {
  iv: iv,
  mode: CryptoJS.mode.CBC,
  padding: CryptoJS.pad.Pkcs7,
});

// 6. Prepend "Salted__" magic bytes + salt
// 7. Base64 encode entire payload
```

#### Response Decryption

```javascript
// 1. Base64 decode response
// 2. Extract salt (bytes 8-16, after "Salted__" prefix)
// 3. Derive same key/IV using EVP_BytesToKey
// 4. Decrypt with AES-256-CBC
// 5. Parse resulting JSON
```

### API Endpoints (Discovered via Traffic Analysis)

- **Authentication**: `https://sync.connect-sanitas-online.de/auth/login/`
- **Data Download**: `https://sync.connect-sanitas-online.de/synchronization/downloadData/`

### Authentication Payload (Reverse Engineered)

```javascript
{
  SourcePlatform: "Android",
  PhoneModel: "<device model>",
  password: "<user password>",
  OS: "Android",
  DeviceId: "<UUID v4>",
  OsVersion: "<Android version>",
  timeZone: "<IANA timezone>",
  PlatForm: "Android",
  userName: "<email>",
  VersionNumber: 190,
  Name: "<device name>"
}
```

### Download Payload (Extracted from Decompiled Code)

```javascript
{
  // Last count fields (all set to 0 for full sync)
  ASSettingsLastCount: 0,
  DeviceClassDurationSettingsLastCount: 0,
  GlucoseMeasurementLastCount: 0,
  // ... (15+ more LastCount fields)

  SourcePlateform: "Android",
  LastSyncDateForDownlaodTables: "1990-01-01T00:00:00.000",
  CurrentPlateformVersions: "AN190",
  SourcePrefix: "AN000******",
  VersionNumber: 190,
  ImageDownloadSource: "IPhone",
  FinalIdentifier: "<from auth response>",
  IsAutomaticSync: 1 or 0,
  ClientDateTime: "<ISO 8601 timestamp>",
  exception_log: "",
  DeviceInfo: "Manufacturer:..#Model:..#Android Version:..#..."
}
```

### Health Connect Integration

The app uses `react-native-health-connect` to write records:

```javascript
await insertRecords([
  {
    recordType: 'Weight',
    weight: { value: 75.5, unit: 'kilograms' },
    time: '2026-02-14T20:30:00.000Z',
  },
]);
```

### Data Mapping (From Sanitas Response)

| Sanitas Field            | Health Connect Type | Transformation             |
| ------------------------ | ------------------- | -------------------------- |
| `WeightKg`               | Weight              | Direct (kg)                |
| `BodyFatPct`             | BodyFat             | Direct (%)                 |
| `BoneMassKg`             | BoneMass            | Direct (kg)                |
| `MusclePct` × `WeightKg` | LeanBodyMass        | `weight × (muscle% / 100)` |
| `WaterPct` × `WeightKg`  | BodyWaterMass       | `weight × (water% / 100)`  |

### Background Execution

Configuration for `react-native-background-fetch`:

```javascript
await BackgroundFetch.configure(
  {
    minimumFetchInterval: 15, // Minutes (Android minimum)
    stopOnTerminate: false, // Continue after app closed
    enableHeadless: true, // Run without app in memory
    startOnBoot: true, // Restart after device reboot
    requiredNetworkType: BackgroundFetch.NETWORK_TYPE_ANY,
  },
  onEvent,
  onTimeout,
);
```

The headless task (registered in `index.js`) ensures sync runs even when the app is terminated.

## Project Structure

```
SanitasSync/
├── android/                 # Android native configuration
├── __tests__/              # Jest unit tests
├── App.js                  # Main UI component (13.5 KB)
├── App.tsx                 # TypeScript entry point
├── SanitasCrypto.js        # Reverse-engineered crypto (6 KB)
├── SanitasSyncLogic.js     # Sync business logic (9.9 KB)
├── index.js                # React Native entry + headless task
├── package.json            # Dependencies
├── babel.config.js         # Babel configuration
├── metro.config.js         # Metro bundler config
├── tsconfig.json           # TypeScript config
├── jest.config.js          # Jest test config
├── .eslintrc.js            # ESLint rules
├── .prettierrc.js          # Prettier formatting
└── README.md               # This file
```

### Dependencies (from package.json)

**Core**:

- `react-native`: 0.82.1
- `react`: 19.1.1

**Health & Background**:

- `react-native-health-connect`: ^3.5.0
- `react-native-background-fetch`: ^4.3.0

**Cryptography**:

- `node-forge`: ^1.3.1 (RSA operations)
- `crypto-js`: ^4.2.0 (AES operations)

**Storage & Utils**:

- `@react-native-async-storage/async-storage`: ^2.2.0
- `react-native-device-info`: ^15.0.1
- `react-native-localize`: ^3.6.0
- `react-native-uuid`: ^2.0.3

**UI**:

- `react-native-paper`: ^5.14.5
- `react-native-vector-icons`: ^10.3.0
- `react-native-safe-area-context`: ^5.6.2

## Permissions

### Android Manifest Permissions

```xml
<!-- Health Connect (declared via library) -->
android.permission.health.READ_WEIGHT
android.permission.health.WRITE_WEIGHT
android.permission.health.READ_BODY_FAT
android.permission.health.WRITE_BODY_FAT
android.permission.health.READ_BONE_MASS
android.permission.health.WRITE_BONE_MASS
android.permission.health.READ_LEAN_BODY_MASS
android.permission.health.WRITE_LEAN_BODY_MASS
android.permission.health.READ_BODY_WATER_MASS
android.permission.health.WRITE_BODY_WATER_MASS

<!-- Background Execution -->
android.permission.RECEIVE_BOOT_COMPLETED
android.permission.WAKE_LOCK

<!-- Network -->
android.permission.INTERNET
android.permission.ACCESS_NETWORK_STATE

<!-- Notifications (Android 13+) -->
android.permission.POST_NOTIFICATIONS
```

### Privacy

- Credentials stored locally in AsyncStorage (unencrypted, standard React Native practice)
- No third-party analytics or tracking
- All network traffic limited to Sanitas servers
- Device ID is randomly generated UUID

## Troubleshooting

### Background Sync Not Working

**Problem**: Automatic synchronization doesn't execute

**Solutions**:

1. Disable battery optimization (Settings → Apps → SanitasSync → Battery → Unrestricted)
2. Samsung devices: Add to "Never Sleeping Apps" (Settings → Battery → Background usage limits)
3. Ensure "Activer le service" toggle is ON
4. Check that credentials are saved
5. Verify network connectivity

### "Erreur Auth" Message

**Problem**: Authentication fails with Sanitas servers

**Solutions**:

1. Double-check email and password (must match Sanitas Connect account)
2. Test credentials in the official Sanitas app first
3. Check internet connection
4. Wait 5 minutes (potential rate limiting)

### "Health Connect indisponible"

**Problem**: Health Connect SDK not available

**Solutions**:

1. Install Google Health Connect from Play Store
2. Verify Android version is 9.0+
3. Restart device

### No Data in Samsung Health

**Problem**: Sync succeeds but data not visible

**Solutions**:

1. Open Samsung Health → Settings → Data permissions → Health Connect → Enable all
2. Force stop Samsung Health and reopen
3. Check date filter in Samsung Health (data might be outside visible range)

### "Erreur Déchiffrement"

**Problem**: Decryption fails on server response

**Possible causes**:

- Server API changed (would require new reverse engineering)
- Network proxy interfering with response
- Device time significantly out of sync

If this occurs, please open a GitHub issue with the error details.

## Security

### Security Through Reverse Engineering

The encryption implementation was extracted from the official Sanitas app, which means:

✅ **Strengths**:

- Uses industry-standard RSA-2048 and AES-256
- Server's public key is authentic (extracted from official APK)
- Protocol matches production Sanitas infrastructure

⚠️ **Limitations**:

- Credentials stored in plain text in AsyncStorage (same as many React Native apps)
- No certificate pinning (intentional for debugging)
- Device ID is random UUID (not hardware-based)

### Threat Model

**What this protects against**:

- Network eavesdropping (all traffic encrypted)
- Unauthorized API access (requires valid credentials)

**What this does NOT protect against**:

- Device compromise (credentials in AsyncStorage)
- Malicious apps with root access
- Physical device access

### Responsible Disclosure

This project demonstrates security research and interoperability. If you discover vulnerabilities in the Sanitas infrastructure itself, please contact Sanitas directly.

## Legal

### Disclaimer

**SanitasSync is an UNOFFICIAL reverse-engineered implementation created for educational purposes and personal use. This project is NOT affiliated with, endorsed by, or connected to Sanitas GmbH, Samsung Electronics, or Google LLC.**

### Terms of Use

- This software is provided "AS IS" without warranty of any kind
- Use at your own risk
- The author is not responsible for any data loss, account suspension, or other damages
- Sanitas may update their API at any time, breaking compatibility
- Using unofficial API clients may violate Sanitas Terms of Service

### Reverse Engineering Notice

This project was created through **reverse engineering** of the Sanitas Connect Android application for **interoperability purposes**. In the European Union, reverse engineering for interoperability is permitted under:

- EU Software Directive (2009/24/EC), Article 6
- French Intellectual Property Code, Article L122-6-1-IV

No proprietary code was copied. All implementations are original work based on protocol observation.

## Contributing

Contributions welcome! This is a community-driven reverse engineering project.

### How to Contribute

1. Fork the repository
2. Create feature branch: `git checkout -b feature/improvement`
3. Make changes
4. Test thoroughly on real Android device
5. Run linter: `npm run lint`
6. Commit: `git commit -m 'Add improvement'`
7. Push: `git push origin feature/improvement`
8. Open Pull Request

### Code Guidelines

- Follow existing code style (ESLint/Prettier configured)
- Add comments explaining reverse-engineered protocol details
- Test on multiple Android versions/devices when possible
- Update README if changing functionality

### Useful Contributions

- Testing on different Android devices
- Improved error handling
- Better battery optimization
- Additional Sanitas device support (requires reverse engineering their protocols)
- Performance improvements

## Acknowledgments

### Tools & Libraries

- [JADX](https://github.com/skylot/jadx) - Android decompiler
- [Burp Suite](https://portswigger.net/burp) - Traffic analysis
- [React Native](https://reactnative.dev/) - Framework
- [node-forge](https://github.com/digitalbazaar/forge) - RSA implementation
- [crypto-js](https://github.com/brix/crypto-js) - AES implementation
- [react-native-health-connect](https://github.com/matinzd/react-native-health-connect) - Health Connect bridge
- [react-native-background-fetch](https://github.com/transistorsoft/react-native-background-fetch) - Background tasks

### Community

Thanks to the reverse engineering and React Native communities for tools and knowledge sharing.

## Support

- **Issues**: [GitHub Issues](https://github.com/charlesbel/SanitasSync/issues)
- **Protocol Updates**: If Sanitas changes their API, please open an issue with Burp Suite logs

---

**⚙️ Built through reverse engineering for the Sanitas + Samsung Health community**

_This is an independent project. Sanitas, Samsung, and Google trademarks belong to their respective owners._

```

```
