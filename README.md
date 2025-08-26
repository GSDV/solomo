# SoLoMo 📍

**So**cial **Lo**cal **Mo**bile - The easiest way to get user location in Expo/React Native apps.

Expo's built-in `Location.getCurrentPositionAsync` can be slow, unpredictable, and requires repetitive permission handling. SoLoMo provides a simple React context that handles permissions, caching, and real-time updates automatically, giving you the most up-to-date location whenever you need it - with type safety!

[![npm version](https://badge.fury.io/js/solomo.svg)](https://badge.fury.io/js/solomo)
[![license](https://img.shields.io/npm/l/solomo.svg)](https://github.com/GSDV/solomo/blob/main/LICENSE)


## 📦 Installation

```bash
npm install solomo expo-location
```

## 🚀 Quick Start

### 1. Wrap your app with LocationProvider

```tsx
import { LocationProvider } from 'solomo';

export default function App() {
  return (
    <LocationProvider>
      <YourApp />
    </LocationProvider>
  );
}
```

### 2. Use location in any component

```tsx
import { useLocation } from 'solomo';

function MyComponent() {
  const { location, hasPermission, requestPermission } = useLocation();

  if (!hasPermission) {
    return <Button onPress={requestPermission} title="Enable Location" />;
  }

  return (
    <Text>
      You are at: {location?.coords.latitude}, {location?.coords.longitude}
    </Text>
  );
}
```

### 3. Display real-time location in a styled card (with map)

```tsx
import { LocationMap, useLocation, useCurrentLocation } from 'solomo';
import React, { useEffect, useState } from 'react';

function LocationCard() {
  const { fetchLocation, error } = useCurrentLocation();
  const { location } = useLocation();
  const [address, setAddress] = useState(null);

  useEffect(() => {
    fetchLocation().then((data) => {
      setAddress(data.address || null);
    });
  }, [fetchLocation]);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ minHeight: 300 }}>
        <LocationMap />
      </View>
      <View style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontWeight: 'bold', marginTop: 30, marginBottom: 10 }}>Current Location Info</Text>
        <View style={{ width: '100%', backgroundColor: '#fff', borderRadius: 18, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 2 }, marginBottom: 24, overflow: 'hidden' }}>
          {location && location.coords && (
            <>
              <TableRow label="Latitude" value={location.coords.latitude} />
              <Divider />
              <TableRow label="Longitude" value={location.coords.longitude} />
              {address && <Divider />}
            </>
          )}
          {address && (
            <>
              {address.country && <><TableRow label="Country" value={address.country} /><Divider /></>}
              {address.city && <><TableRow label="City" value={address.city} /><Divider /></>}
              {address.region && <><TableRow label="Region" value={address.region} /><Divider /></>}
              {address.timezone && <><TableRow label="Timezone" value={address.timezone} /><Divider /></>}
              {address.street && <><TableRow label="Street" value={address.street} /><Divider /></>}
              {address.postalCode && <><TableRow label="Postal Code" value={address.postalCode} /><Divider /></>}
              {address.name && <TableRow label="Name" value={address.name} />}
            </>
          )}
          {!address && !location && !error && (
            <Text style={{ color: 'gray', textAlign: 'center', padding: 18 }}>Fetching location info...</Text>
          )}
          {error && (
            <Text style={{ color: 'red', textAlign: 'center', padding: 18 }}>Location error: {error.message}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

function TableRow({ label, value }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff' }}>
      <Text style={{ fontWeight: '500', fontSize: 16, color: '#222' }}>{label}</Text>
      <Text style={{ fontSize: 16, color: '#444' }}>{value}</Text>
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: '#f0f0f0', marginHorizontal: 20 }} />;
}
```

## 🎯 Usage Examples

### Get current location once

```tsx
import { useCurrentLocation } from 'solomo';

function GetLocationButton() {
  const { fetchLocation } = useCurrentLocation();

  const handlePress = async () => {
    const result = await fetchLocation();
    if (result.granted && result.location) {
      console.log('Current location:', result.location.coords);
    }
  };

  return <Button onPress={handlePress} title="Get My Location" />;
}
```

### Watch location changes

```tsx
import { useLocationWatcher } from 'solomo';

function LocationTracker() {
  const { location, isWatching } = useLocationWatcher(true); // Auto-start watching

  return (
    <View>
      <Text>Watching: {isWatching ? 'Yes' : 'No'}</Text>
      {location && (
        <Text>
          Lat: {location.coords.latitude.toFixed(6)}
          Lng: {location.coords.longitude.toFixed(6)}
        </Text>
      )}
    </View>
  );
}
```

### Custom configuration

```tsx
import { LocationProvider } from 'solomo';
import * as Location from 'expo-location';

function App() {
  return (
    <LocationProvider
      config={{
        accuracy: Location.Accuracy.Highest,
        maxCacheAge: 2 * 60 * 1000,
      }}
    >
      <YourApp />
    </LocationProvider>
  );
}
```





## 📊 What Data Do You Get?

SoLoMo provides the following data fields and objects:

- **Location**
  - `location.coords.latitude` (number)
  - `location.coords.longitude` (number)
  - `location.coords.accuracy` (number)
  - `location.timestamp` (number)
  - `location.coords.altitude` (number, if available)
  - `location.coords.heading` (number, if available)
  - `location.coords.speed` (number, if available)

- **Address (Reverse Geocoding)**
  - `address.country` (string)
  - `address.city` (string)
  - `address.region` (string)
  - `address.street` (string)
  - `address.postalCode` (string)
  - `address.timezone` (string)
  - `address.name` (string, if available)

- **Permissions & Status**
  - `hasPermission` (boolean)
  - `isWatching` (boolean)
  - `error` (object, if any)
  - `lastUpdated` (timestamp)

- **Geofencing**
  - `geofences` (array of regions)
  - `geofenceEvents` (array of enter/exit events)

- **Config & Utility**
  - `config.accuracy` (Location accuracy setting)
  - `config.maxCacheAge` (Cache duration)
  - `fromCache` (boolean, if location is from cache)

All data is available via hooks: `useLocation`, `useCurrentLocation`, `useLocationWatcher`, and context.

- ✅ **Zero configuration** - Works out of the box
- ✅ **Smart caching** - Avoid unnecessary GPS calls
- ✅ **Real-time location updates** - Know exactly where a user is
- ✅ **Type Safety** - Full TypeScript support
- ✅ **Configurable** - Set different accuracy levels
- ✅ **Reverse geocoding** - Get address info from coordinates
- ✅ **Geofencing support** - Register regions and get enter/exit events
- ✅ **Dynamic feature detection** - Works in Expo Go and dev builds
- ✅ **Styled UI helpers** - TableRow, Divider, LocationMap for modern cards



## 🛠 API Reference

### LocationProvider Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `config.accuracy` | `Location.Accuracy` | `Balanced` | GPS accuracy level |
| `config.maxCacheAge` | `number` | `300000` | Cache duration in ms (5 min) |

### useLocation Hook

```tsx
const {
  location,          // Current location object
  error,             // Location error if any
  hasPermission,     // Permission status
  isWatching,        // Whether actively watching location
  requestPermission, // Function to request permission
  getCurrentLocation,// Function to get location once
  startWatching,     // Function to start watching
  stopWatching,      // Function to stop watching
} = useLocation();
```

### useCurrentLocation Hook

```tsx
const { fetchLocation, error } = useCurrentLocation(options?);
```

### useLocationWatcher Hook

```tsx
const {
  location,
  isWatching,
  error,
  startWatching,
  stopWatching
} = useLocationWatcher(autoStart?, options?);
```

## 🔧 Configuration Options

```tsx
interface LocationConfig {
  accuracy?: Location.Accuracy;    // GPS accuracy
  maxCacheAge?: number;           // Cache duration in milliseconds
}
```

## 📝 License

MIT © [Gabriele Scotto di Vettimo](https://github.com/GSDV)

## 🤝 Contributing

Issues and pull requests are welcome! Check out the [GitHub repository](https://github.com/GSDV/solomo).

## 👥 Contributors

<a href="https://github.com/GSDV/solomo/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=GSDV/solomo" alt="Contributors" />
</a>

<p align="center">
  <a href="https://github.com/GSDV/solomo/graphs/contributors">
    <img src="https://img.shields.io/github/contributors/GSDV/solomo?style=for-the-badge" alt="Contributors" />
  </a>
  <a href="https://github.com/GSDV/solomo/stargazers">
    <img src="https://img.shields.io/github/stars/GSDV/solomo?style=for-the-badge" alt="Stars" />
  </a>
  <a href="https://github.com/GSDV/solomo/network/members">
    <img src="https://img.shields.io/github/forks/GSDV/solomo?style=for-the-badge" alt="Forks" />
  </a>
  <a href="https://github.com/GSDV/solomo/issues">
    <img src="https://img.shields.io/github/issues/GSDV/solomo?style=for-the-badge" alt="Issues" />
  </a>
</p>
