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



## 🎯 Features

- ✅ **Zero configuration** - Works out of the box
- ✅ **Smart caching** - Avoid unnecessary GPS calls
- ✅ **Real-time location updates** - Know exactly where a user is
- ✅ **Type Safety** - Full TypeScript support
- ✅ **Configurable** - Set different accuracy levels



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

MIT

## 🤝 Contributing

Issues and pull requests are welcome! Check out the [GitHub repository](https://github.com/GSDV/solomo).